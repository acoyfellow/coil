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
  {
    ...summary('pinned-old', 'paused', false),
    pinned: true,
    updatedAt: Date.now() - 30 * 86_400_000,
  },
  { ...summary('old-one', 'paused', false), updatedAt: Date.now() - 30 * 86_400_000 },
];

const folders = [
  { id: 'f-coil', name: 'Coil', order: 1, createdAt: 0 },
  { id: 'f-empty', name: 'Empty one', order: 2, createdAt: 0 },
];

const filed = [
  ...threads.map((thread) =>
    thread.name === 'awake-one' || thread.name === 'busy-one'
      ? { ...thread, folder: 'f-coil' }
      : thread,
  ),
  { ...summary('stray', 'paused', false), folder: null },
];

const disk = new Map<string, string>();

const fakeApi = (calls: string[]): CoilApi =>
  ({
    list: async () => filed,
    folders: async () => folders,
    fileThread: async (name: string, folder: string | null) => {
      calls.push(`file ${name} ${folder}`);

      return { ...summary(name, 'paused', false), folder };
    },
    view: async (name: string) => {
      const found = views[name];

      if (found === undefined) throw new Error(`unknown thread ${name}`);

      return found;
    },
    resize: async (name: string, size: string) => {
      calls.push(`resize ${name} ${size}`);

      return { size, restarted: false };
    },
    list_dir: async () => [{ name: 'hello.ts', type: 'file', size: 10 }],
    list_files: async () => [...disk.keys()].sort(),
    read: async (_name: string, path: string) => {
      calls.push(`read ${path}`);

      return disk.get(path) ?? '';
    },
    write: async (_name: string, path: string, content: string) => {
      calls.push(`write ${path} ${JSON.stringify(content)}`);
      disk.set(path, content);

      return { path: `/workspace/${path}`, bytes: content.length };
    },
    pin: async (name: string, pinned: boolean) => {
      calls.push(`pin ${name} ${pinned}`);

      return { ...summary(name, 'paused', false), pinned };
    },
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

const typeInto = async (text: string) => {
  const content = document.querySelector<HTMLElement>('#editor .cm-content');
  const { EditorView } = await import('@codemirror/view');
  const view = content === null ? null : EditorView.findFromDOM(content);

  view?.dispatch({ changes: { from: view.state.doc.length, insert: text } });
};

const openHello = async (calls: string[]) => {
  const errors = await boot('/t/paused-one', calls);

  await waitFor(
    () =>
      document.querySelector('.entry, [data-entry]') !== null ||
      document.querySelectorAll('.files .row').length > 0,
  );
  const row = [...document.querySelectorAll<HTMLElement>('.files .row')].find((node) =>
    (node.textContent ?? '').includes('hello.ts'),
  );

  row?.click();
  await waitFor(() => document.querySelector('#editor .cm-content') !== null);

  return errors;
};

describe('the code editor', { timeout: COLD_BOOT_MS }, () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    disk.clear();
    disk.set('hello.ts', 'const a = 1;\n');
  });

  it('shows the empty-folder pattern only for an empty folder, not for a folder with files', async () => {
    const errors = await boot('/t/paused-one');

    await waitFor(() => document.querySelectorAll('.files .row').length > 0);

    expect(errors).toEqual([]);
    expect(document.querySelector('.files')?.classList.contains('is-empty')).toBe(false);
  });

  it('opens a file in CodeMirror, marks edits unsaved, and saves through WriteFile', async () => {
    const calls: string[] = [];
    const errors = await openHello(calls);

    expect(document.querySelector('#editor .cm-content')?.textContent).toContain('const a = 1;');
    expect(document.querySelector('.dirty-dot')).toBeNull();

    await typeInto('const b = 2;\n');
    await settle();
    expect(document.querySelector('.dirty-dot')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('#editor-save')?.click();
    await settle();

    expect(errors).toEqual([]);
    expect(calls).toContain('write hello.ts "const a = 1;\\nconst b = 2;\\n"');
    expect(document.querySelector('.dirty-dot')).toBeNull();
    expect(document.querySelector('#editor-save')?.textContent).toBe('Saved');
    expect(document.querySelector('#file-dialog #editor')).not.toBeNull();
    expect(document.querySelector('.files')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('#editor-close')?.click();
    await settle();

    expect(document.querySelector('#file-dialog')).toBeNull();
    expect(document.querySelector('.files .row')).not.toBeNull();
  });

  it('editor tabs and the styled discard dialog work in the real DOM, with no browser confirm', async () => {
    disk.set('notes/plan.md', '# plan\n');
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const errors = await openHello([]);

    expect(document.querySelectorAll('.editor-tab')).toHaveLength(1);

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }));
    await waitFor(() => document.querySelector('#quick-open [data-path="notes/plan.md"]') !== null);
    document.querySelector<HTMLButtonElement>('#quick-open [data-path="notes/plan.md"]')?.click();
    await waitFor(() => document.querySelectorAll('.editor-tab').length === 2);

    expect(document.querySelector('#quick-open')).toBeNull();
    expect(document.querySelector('.editor-tab.on')?.getAttribute('data-path')).toBe(
      'notes/plan.md',
    );

    document
      .querySelector<HTMLButtonElement>('.editor-tab[data-path="hello.ts"] .editor-tab-name')
      ?.click();
    await waitFor(() =>
      (document.querySelector('#editor .cm-content')?.textContent ?? '').includes('const a'),
    );
    await typeInto('x');
    await settle();
    document
      .querySelector<HTMLButtonElement>('.editor-tab[data-path="hello.ts"] .editor-tab-close')
      ?.click();
    await settle();

    expect(document.querySelector('#discard-dialog')?.textContent).toContain('hello.ts');
    document.querySelector<HTMLButtonElement>('#discard-keep')?.click();
    await settle();
    expect(document.querySelector('#discard-dialog')).toBeNull();
    expect(document.querySelectorAll('.editor-tab')).toHaveLength(2);

    document
      .querySelector<HTMLButtonElement>('.editor-tab[data-path="hello.ts"] .editor-tab-close')
      ?.click();
    await settle();
    document.querySelector<HTMLButtonElement>('#discard-confirm')?.click();
    await settle();

    expect(document.querySelectorAll('.editor-tab')).toHaveLength(1);
    expect(document.querySelector('.editor-tab')?.getAttribute('data-path')).toBe('notes/plan.md');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    vi.unstubAllGlobals();
  });
});
