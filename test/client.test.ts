import { Context } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreadSummary, ThreadView } from '../shared/protocol';
import { type CoilApi, rpcHandler } from '../src/rpc';

const view = (name: string, phase: 'awake' | 'paused', busy: boolean): ThreadView => ({
  name,
  title: `Thread ${name}`,
  phase,
  busy,
  running: phase === 'awake',
  repo: null,
  origin: { parent: null, forkedFrom: null, base: null, seed: null },
  owner: 'you@example.com',
  size: 'standard-1',
  messages: [
    { id: 'm1', role: 'user', kind: 'message', text: 'hello' },
    { id: 'm2', role: 'assistant', kind: 'message', text: `answer from ${name}` },
  ],
  pairs: [],
  execs: [],
  surfaces: [{ id: 't1', kind: 'terminal', title: 'shell' }],
  model: '@cf/zai-org/glm-5.3',
  usage: { input: 0, output: 0, cacheRead: 0, cost: 0, contextTokens: 0, contextWindow: 1048576 },
  turns: [],
});

const summary = (name: string, phase: string, busy: boolean): ThreadSummary => ({
  name,
  title: `Thread ${name}`,
  phase,
  busy,
  repo: null,
  parent: null,
  forkedFrom: null,
  createdBy: 'web',
  owner: 'you@example.com',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archived: false,
  model: '',
  spend: 0,
  looping: false,
});

const views: Record<string, ThreadView> = {
  'awake-one': view('awake-one', 'awake', false),
  'busy-one': view('busy-one', 'awake', true),
  'paused-one': view('paused-one', 'paused', false),
};

const threads = [
  summary('awake-one', 'awake', false),
  summary('busy-one', 'awake', true),
  summary('paused-one', 'paused', false),
];

const fakeApi = (calls: string[]): CoilApi =>
  ({
    list: async () => threads,
    view: async (name: string) => {
      const found = views[name];

      if (found === undefined) throw new Error(`unknown thread ${name}`);

      return found;
    },
    resize: async (name: string, size: string) => {
      calls.push(`resize ${name} ${size}`);

      return { size, restarted: false };
    },
    list_dir: async () => [],
    start: async (name: string, requestId: string) => {
      calls.push(`start ${name}`);

      return { requestId };
    },
  }) as unknown as CoilApi;

const settle = async () => {
  for (let round = 0; round < 20; round += 1)
    await new Promise((resolve) => setTimeout(resolve, 10));
};

const waitFor = async (ready: () => boolean, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;

  while (!ready() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
};

const boot = async (path: string, calls: string[] = []) => {
  const errors: string[] = [];
  const handler = rpcHandler({ who: 'you@example.com', api: fakeApi(calls) });
  const realFetch = globalThis.fetch;

  vi.resetModules();
  window.history.replaceState({}, '', path);
  document.body.innerHTML = '<div id="root"></div>';
  Object.assign(globalThis, {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        String(input instanceof Request ? input.url : input),
        window.location.origin,
      );

      if (url.pathname.startsWith('/api/rpc'))
        return handler(new Request(url, input instanceof Request ? input : init), Context.empty());

      return realFetch(input, init);
    },
    EventSource: class {
      static CLOSED = 2;
      readyState = 1;
      onmessage = null;
      onerror = null;
      close() {}
    },
    WebSocket: class {
      static OPEN = 1;
      readyState = 0;
      send() {}
      close() {}
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  window.addEventListener('error', (event) => errors.push(String(event.error ?? event.message)));
  window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));

  await import('../client/src/entry');
  await waitFor(
    () => document.querySelector('.app') !== null && document.querySelector('.skeleton') === null,
  );
  await settle();

  return errors;
};

const COLD_BOOT_MS = 20_000;

describe('the foldkit client loads conversations', { timeout: COLD_BOOT_MS }, () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const name of Object.keys(views)) {
    it(`opens ${name} and shows its messages without a script error`, async () => {
      const errors = await boot(`/t/${name}`);

      expect(errors).toEqual([]);
      expect(document.body.textContent).toContain(`answer from ${name}`);
      expect(document.querySelector('#size')).not.toBeNull();
      expect(
        document.querySelectorAll(
          '.act-group > .act > svg.icon, .act-group > .size-wrap > .act > svg.icon',
        ).length,
      ).toBe(7);
      const usage = document.querySelector('#usage');

      expect(usage?.textContent).not.toContain('$');
      expect(usage?.getAttribute('data-tip')).toMatch(/^Context /);
      expect(usage?.querySelector('.ring')).not.toBeNull();
      expect(document.querySelector('#model')?.textContent).toContain('GLM');
    });
  }

  it('lists threads on the home page without a script error', async () => {
    const errors = await boot('/');

    expect(errors).toEqual([]);
    expect(document.body.textContent).toContain('Thread paused-one');
  });

  it('picking a size from the size menu resizes the thread through the RPC', async () => {
    Object.assign(window, { confirm: () => true });
    await boot('/t/paused-one');
    document.querySelector<HTMLButtonElement>('#size')?.click();
    await settle();
    document.querySelector<HTMLButtonElement>('[data-size="standard-3"]')?.click();

    const toasts = () =>
      [...document.querySelectorAll('.toast')].map((toast) => toast.textContent ?? '');

    await waitFor(() => toasts().includes('The computer will start at standard-3.'));

    expect(toasts()).toContain('The computer will start at standard-3.');
    expect(document.querySelector('#size-list')?.hasAttribute('hidden')).toBe(true);
  });
});
