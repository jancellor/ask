import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAISubscriptionFetch } from './openai-subscription-fetch.js';

const originalFetch = global.fetch;
const originalHome = process.env.HOME;

describe('createOpenAISubscriptionFetch', () => {
  beforeEach(async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'ask-openai-oauth-'));
    process.env.HOME = home;
    await mkdir(path.join(home, '.config', 'ask'), { recursive: true });
    await writeFile(
      path.join(home, '.config', 'ask', 'openai-oauth.json'),
      JSON.stringify({
        refresh: 'refresh-token',
        access: 'access-token',
        expires: Date.now() + 60_000,
        accountId: 'acc-123',
      }),
      'utf-8',
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  it('rewrites OpenAI responses requests to the Codex endpoint with OAuth headers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const req = input instanceof Request ? input : new Request(input);
      expect(req.url).toBe('https://chatgpt.com/backend-api/codex/responses');
      expect(req.headers.get('authorization')).toBe('Bearer access-token');
      expect(req.headers.get('ChatGPT-Account-Id')).toBe('acc-123');
      expect(req.headers.get('OpenAI-Beta')).toBe('responses=experimental');
      expect(req.headers.get('originator')).toBe('ask');
      expect(req.headers.get('user-agent')).toContain('ask (');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    global.fetch = fetchMock as typeof fetch;

    const subscriptionFetch = createOpenAISubscriptionFetch();
    await subscriptionFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-5' }),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects non-openai hosts', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const subscriptionFetch = createOpenAISubscriptionFetch();
    await expect(
      subscriptionFetch('https://example.com/v1/responses', {
        method: 'POST',
      }),
    ).rejects.toThrow('OAuth subscription mode requires an OpenAI host');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
