import { chmod, mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';
const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const POLL_SAFETY_MS = 3000;

type Claims = {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string;
  };
};

type TokenResponse = {
  id_token?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
};

type DeviceCodeResponse = {
  device_auth_id: string;
  user_code: string;
  interval: string;
};

type DeviceTokenResponse = {
  authorization_code: string;
  code_verifier: string;
};

type Store = {
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
};

function parseJwtClaims(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Claims;
  } catch {
    return undefined;
  }
}

function accountIdFromClaims(claims: Claims) {
  return (
    claims.chatgpt_account_id ||
    claims['https://api.openai.com/auth']?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  );
}

function extractAccountId(tokens: TokenResponse) {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token);
    if (claims) {
      const id = accountIdFromClaims(claims);
      if (id) return id;
    }
  }
  const claims = parseJwtClaims(tokens.access_token);
  if (!claims) return undefined;
  return accountIdFromClaims(claims);
}

function expand(p: string) {
  if (!p.startsWith('~/')) return p;
  return path.join(os.homedir(), p.slice(2));
}

function buildStore(tokens: TokenResponse): Store {
  return {
    refresh: tokens.refresh_token,
    access: tokens.access_token,
    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId: extractAccountId(tokens),
  };
}

async function readStore(file: string) {
  try {
    const raw = await readFile(file, 'utf-8');
    return JSON.parse(raw) as Store;
  } catch {
    return undefined;
  }
}

async function writeStore(file: string, data: Store) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
  await chmod(file, 0o600).catch(() => {});
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isAllowedSubscriptionHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === 'openai.com' ||
    host.endsWith('.openai.com') ||
    host === 'chatgpt.com' ||
    host.endsWith('.chatgpt.com')
  );
}

async function refreshToken(baseFetch: typeof fetch, refresh: string) {
  const res = await baseFetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`OpenAI OAuth refresh failed: ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

async function loginWithDeviceCode(baseFetch: typeof fetch) {
  const init = await baseFetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!init.ok) {
    throw new Error(`OpenAI OAuth device start failed: ${init.status}`);
  }

  const info = (await init.json()) as DeviceCodeResponse;
  const interval = Math.max(parseInt(info.interval) || 5, 1) * 1000;
  const prompt = { url: `${ISSUER}/codex/device`, code: info.user_code };

  console.error(`Open ${prompt.url} and enter code ${prompt.code}`);

  while (true) {
    const poll = await baseFetch(`${ISSUER}/api/accounts/deviceauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_auth_id: info.device_auth_id,
        user_code: info.user_code,
      }),
    });

    if (poll.ok) {
      const data = (await poll.json()) as DeviceTokenResponse;
      const token = await baseFetch(`${ISSUER}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: data.authorization_code,
          redirect_uri: `${ISSUER}/deviceauth/callback`,
          client_id: CLIENT_ID,
          code_verifier: data.code_verifier,
        }).toString(),
      });
      if (!token.ok) {
        throw new Error(`OpenAI OAuth token exchange failed: ${token.status}`);
      }
      return (await token.json()) as TokenResponse;
    }

    if (poll.status !== 403 && poll.status !== 404) {
      throw new Error(`OpenAI OAuth device polling failed: ${poll.status}`);
    }

    await sleep(interval + POLL_SAFETY_MS);
  }
}

/**
 * I don't think this works but leaving it plugged in for now.
 * We might need to set other headers/content in order to use subscriptions.
 */
export function createOpenAISubscriptionFetch() {
  const baseFetch = fetch;
  const file = expand('~/.config/ask/openai-oauth.json');
  const skew = 30_000;
  let inflight: Promise<Store> | undefined;

  function isMarked(headers: Headers) {
    const value = headers.get('authorization');
    return value === 'Bearer oauth';
  }

  function rewriteUrl(url: URL) {
    if (url.pathname.includes('/v1/responses'))
      return new URL(CODEX_API_ENDPOINT);
    if (url.pathname.includes('/chat/completions'))
      return new URL(CODEX_API_ENDPOINT);
    return url;
  }

  async function ensureAuth() {
    if (inflight) return inflight;

    const run = (async () => {
      const saved = await readStore(file);
      if (saved && saved.expires > Date.now() + skew) {
        return saved;
      }

      if (saved?.refresh) {
        const next = buildStore(await refreshToken(baseFetch, saved.refresh));
        await writeStore(file, next);
        return next;
      }

      const next = buildStore(await loginWithDeviceCode(baseFetch));
      await writeStore(file, next);
      return next;
    })();

    inflight = run;
    run.finally(() => {
      if (inflight === run) inflight = undefined;
    });
    return run;
  }

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (!isMarked(req.headers)) {
      return baseFetch(input, init);
    }

    const reqUrl = new URL(req.url);
    if (!isAllowedSubscriptionHost(reqUrl.hostname)) {
      throw new Error(
        `OAuth subscription mode requires an OpenAI host, got: ${reqUrl.hostname}`,
      );
    }

    const auth = await ensureAuth();
    const url = rewriteUrl(reqUrl);
    const out = new Request(url, req);
    out.headers.set('authorization', `Bearer ${auth.access}`);
    if (auth.accountId) out.headers.set('ChatGPT-Account-Id', auth.accountId);
    if (!auth.accountId) out.headers.delete('ChatGPT-Account-Id');
    return baseFetch(out);
  };
}
