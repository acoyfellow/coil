import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserTools } from './agent';
import { normalizeUrl } from './browser';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type CdpEvent = { method: string; params: Record<string, unknown> };

export type CdpSession = {
  readonly send: <T = Record<string, unknown>>(method: string, params?: Record<string, unknown>) => Promise<T>;
  readonly events: CdpEvent[];
  readonly close: () => void;
};

const COMMAND_TIMEOUT_MS = 15_000;

export const connectCdp = (webSocketUrl: string): Promise<CdpSession> =>
  new Promise((resolveSession, rejectSession) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map<number, Pending>();
    const events: CdpEvent[] = [];
    let nextId = 1;

    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> };
      if (data.id === undefined) {
        if (data.method) events.push({ method: data.method, params: data.params ?? {} });
        return;
      }
      const waiter = pending.get(data.id);
      if (!waiter) return;
      pending.delete(data.id);
      if (data.error) waiter.reject(new Error(data.error.message));
      else waiter.resolve(data.result);
    });
    socket.addEventListener('error', () => rejectSession(new Error(`cdp connect failed: ${webSocketUrl}`)));
    socket.addEventListener('open', () =>
      resolveSession({
        events,
        close: () => socket.close(),
        send: <T>(method: string, params: Record<string, unknown> = {}) =>
          new Promise<T>((resolve, reject) => {
            const id = nextId++;
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error(`cdp ${method} timed out`));
            }, COMMAND_TIMEOUT_MS);
            pending.set(id, {
              resolve: (value) => { clearTimeout(timer); resolve(value as T); },
              reject: (error) => { clearTimeout(timer); reject(error); },
            });
            socket.send(JSON.stringify({ id, method, params }));
          }),
      }),
    );
  });

export const firstPageTarget = async (httpEndpoint: string): Promise<string> => {
  const response = await fetch(`${httpEndpoint}/json/list`);
  const targets = (await response.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
  const created = await fetch(`${httpEndpoint}/json/new?about:blank`, { method: 'PUT' });
  return ((await created.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
};

const SNAPSHOT_SCRIPT = `(() => {
  const selector = 'a[href], button, input, textarea, select, [role=button], [role=link], [contenteditable=true], [onclick]';
  const nodes = [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length > 0);
  return nodes.map((el, index) => {
    const ref = 'e' + (index + 1);
    el.setAttribute('data-coil-ref', ref);
    const role = el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? 'textbox' : el.tagName.toLowerCase());
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || '').trim().slice(0, 80);
    return '- ' + role + ' "' + name + '" [ref=' + ref + ']';
  }).join('\\n');
})()`;

const KEYS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
};

export const cdpBrowserTools = (session: CdpSession, screenshotDir = join(tmpdir(), 'coil-cdp-shots')): BrowserTools => {
  const evaluate = async (expression: string): Promise<string> => {
    const reply = await session.send<{ result: { value?: unknown; description?: string }; exceptionDetails?: { text: string } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (reply.exceptionDetails) throw new Error(`eval failed: ${reply.exceptionDetails.text}`);
    const value = reply.result.value ?? reply.result.description ?? '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  };
  const where = async () => {
    const title = await evaluate('document.title');
    const url = await evaluate('location.href');
    return `${title.trim() === '' ? '(no title)' : title.trim()}\n${url}`;
  };
  const waitForLoad = async () => {
    const deadline = Date.now() + COMMAND_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if ((await evaluate('document.readyState').catch(() => 'loading')) === 'complete') return;
      await Bun.sleep(50);
    }
    throw new Error('page did not finish loading');
  };
  const byRef = (ref: string) => `document.querySelector('[data-coil-ref="${ref.replace(/"/g, '')}"]')`;
  const settle = async () => {
    await Bun.sleep(100);
    await waitForLoad();
  };
  const ready = Promise.all([session.send('Runtime.enable'), session.send('Page.enable')]);

  return {
    open: async (url) => {
      await ready;
      await session.send('Page.navigate', { url: normalizeUrl(url) });
      await settle();
      return where();
    },
    snapshot: async () => {
      await ready;
      const refs = await evaluate(SNAPSHOT_SCRIPT);
      const text = await evaluate('document.body ? document.body.innerText : ""');
      return `${await where()}\n\n${refs}\n\ntext:\n${text.trim().slice(0, 2500)}`;
    },
    click: async (ref) => {
      const found = await evaluate(`(() => { const el = ${byRef(ref)}; if (!el) return 'missing'; el.scrollIntoView({block:'center'}); el.click(); return 'ok'; })()`);
      if (found !== 'ok') throw new Error(`no element for ${ref}`);
      await settle();
      return `clicked ${ref}; now at ${await where()}`;
    },
    type: async (text, ref) => {
      if (ref !== undefined) {
        const found = await evaluate(`(() => { const el = ${byRef(ref)}; if (!el) return 'missing'; el.focus(); if ('value' in el) el.value = ''; return 'ok'; })()`);
        if (found !== 'ok') throw new Error(`no element for ${ref}`);
      }
      await session.send('Input.insertText', { text });
      return `typed ${text.length} chars`;
    },
    key: async (key) => {
      const spec = KEYS[key] ?? { key, code: key, keyCode: 0, text: key.length === 1 ? key : undefined };
      const base = { key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode };
      await session.send('Input.dispatchKeyEvent', { type: spec.text ? 'keyDown' : 'rawKeyDown', ...base, text: spec.text });
      await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await settle();
      return `pressed ${key}; now at ${await where()}`;
    },
    evaluate: async (expression) => (await evaluate(expression)).trim(),
    look: async () => {
      const shot = await session.send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
      mkdirSync(screenshotDir, { recursive: true });
      const path = join(screenshotDir, `shot-${Date.now()}.png`);
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
      return `${await where()}\nscreenshot saved at ${path}`;
    },
    logs: async (clear) => {
      const lines = session.events
        .filter((event) => event.method === 'Runtime.consoleAPICalled')
        .map((event) => {
          const args = (event.params.args as Array<{ value?: unknown; description?: string }>) ?? [];
          return `[${String(event.params.type)}] ${args.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ')}`;
        });
      if (clear) session.events.length = 0;
      return lines.length === 0 ? '(no console messages)' : lines.join('\n');
    },
  };
};
