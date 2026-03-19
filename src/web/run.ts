import { spawn } from 'node:child_process';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Agent, type AgentOptions } from '../agent/agent.js';
import { ShutdownManager } from '../shutdown-manager.js';
import { buildHtml } from './html.js';

type RunWebOptions = {
  agentOptions: AgentOptions;
  port?: number;
};

export async function runWeb(options: RunWebOptions): Promise<void> {
  const agent = await Agent.create(options.agentOptions);

  const shutdownManager = new ShutdownManager();
  shutdownManager.installSignalHandlers();
  shutdownManager.addListener(async () => agent.abortAll());

  const app = new Hono();

  app.get('/', (c) => {
    return c.html(
      buildHtml({
        messages: agent.messages,
        model: agent.model,
        provider: agent.provider,
        variant: agent.variant,
      }),
    );
  });

  app.get('/manifest.json', (c) => {
    return c.json({
      name: 'Ask',
      short_name: 'Ask',
      start_url: '/',
      display: 'standalone',
      background_color: '#111',
      theme_color: '#111',
      icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    });
  });

  app.get('/icon.svg', (c) => {
    return c.body(APP_ICON, {
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  });

  app.post('/ask', async (c) => {
    const body = await c.req.json<{ message: string }>();
    if (!body?.message || typeof body.message !== 'string') {
      return c.json({ error: 'message required' }, 400);
    }

    const encoder = new TextEncoder();
    let closed = false;

    const readable = new ReadableStream({
      start(controller) {
        const write = (data: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            closed = true;
          }
        };

        agent
          .ask(body.message, () => {
            write(
              JSON.stringify({
                type: 'messages',
                messages: agent.messages,
              }) + '\n',
            );
          })
          .then(() => {
            write(JSON.stringify({ type: 'done' }) + '\n');
            if (!closed) {
              try {
                controller.close();
              } catch {}
            }
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            write(JSON.stringify({ type: 'error', error: msg }) + '\n');
            if (!closed) {
              try {
                controller.close();
              } catch {}
            }
          });
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      },
    });
  });

  app.post('/abort', async (c) => {
    await agent.abortCurrent();
    return c.json({ ok: true });
  });

  const server = serve(
    { fetch: app.fetch, port: options.port ?? 0 },
    (info) => {
      const url = `http://localhost:${info.port}`;
      console.log(`Ask web interface: ${url}`);
      launchBrowser(url);
    },
  );

  shutdownManager.addListener(async () => {
    server.close();
  });

  await new Promise<void>((resolve) => {
    server.on('close', resolve);
  });
}

function launchBrowser(url: string): void {
  const child = spawn('google-chrome', [`--app=${url}`], {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', (err) => {
    console.error(`Failed to launch browser: ${err.message}`);
  });
  child.unref();
}

// A right-pointing triangle on a dark rounded square.
const APP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1a1a1a"/>
  <polygon points="192,128 368,256 192,384" fill="#d0d0d0"/>
</svg>`;
