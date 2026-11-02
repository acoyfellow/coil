import type { Terminal } from 'cloudterm';
import { terminalPath } from '../../../shared/protocol';
import { TERMINAL_ACK_EVERY_BYTES } from '../../../src/flow';
import { cssVar, nothingFocused, socketUrl, spinnerNode } from './dom';

type TermModule = {
  mount: (el: HTMLElement, options: Record<string, unknown>) => Promise<Terminal>;
};

declare global {
  interface Window {
    __TERM_SRC?: string;
    __coilTerm?: number;
    __coilBytes?: number;
  }
}

let termModule: Promise<TermModule> | null = null;

const importModule = new Function('source', 'return import(source)') as (
  source: string,
) => Promise<unknown>;

const loadTerm = (): Promise<TermModule> => {
  const source = globalThis.window.__TERM_SRC ?? '/assets/term.js';

  termModule ??= importModule(source) as Promise<TermModule>;

  return termModule;
};

const termTheme = () => ({
  background: cssVar('--term-bg'),
  foreground: cssVar('--term-fg'),
  cursor: cssVar('--orange'),
  fontFamily: cssVar('--mono'),
  fontSize: 12.5,
});

const MAX_RETRY_MS = 8000;

export const attachTerminal = (host: HTMLElement, thread: string, id: string): (() => void) => {
  const screen = document.createElement('div');
  const status = document.createElement('div');

  screen.className = 'term-host';
  screen.dataset.term = id;
  status.className = 'term-status';
  status.replaceChildren(spinnerNode(), 'Connecting');
  host.replaceChildren(screen, status);

  let term: Terminal | null = null;
  let socket: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let observer: ResizeObserver | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const send = (data: string | Uint8Array) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(typeof data === 'string' ? data : new Uint8Array(data));
  };

  const showStatus = (...nodes: (Node | string)[]) => {
    status.hidden = false;
    status.replaceChildren(...nodes);
  };

  const open = async (): Promise<void> => {
    if (closed) return;

    const { mount } = await loadTerm();

    if (closed) return;

    if (term === null) {
      const before = document.activeElement;

      term = await mount(screen, {
        theme: termTheme(),
        onData: (bytes: Uint8Array) => send(bytes),
        onResize: (cols: number, rows: number) => {
          if (cols >= 2 && rows >= 2) send(JSON.stringify({ resize: [cols, rows] }));
        },
      });
      if (before instanceof HTMLElement && before !== document.body && before.isConnected)
        before.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('#text')?.focus({ preventScroll: true });
      observer = new ResizeObserver(() => {
        if (host.isConnected && host.offsetWidth > 0) term?.fit();
      });
      observer.observe(screen);
    }

    const active = term;

    if (host.offsetWidth > 0) active.fit();

    const cols = Math.max(20, Math.min(500, active.cols || 80));
    const rows = Math.max(5, Math.min(300, active.rows || 24));
    const ws = new WebSocket(socketUrl(terminalPath(thread, id, cols, rows)));
    let unacked = 0;

    ws.binaryType = 'arraybuffer';
    socket = ws;
    ws.onopen = () => {
      retry = 0;
      status.hidden = true;
      status.replaceChildren();
      if (active.cols >= 2 && active.rows >= 2)
        ws.send(JSON.stringify({ resize: [active.cols, active.rows] }));
      if (nothingFocused()) active.focus();
      globalThis.window.__coilTerm = (globalThis.window.__coilTerm ?? 0) + 1;
    };
    ws.onmessage = (incoming: MessageEvent<ArrayBuffer>) => {
      globalThis.window.__coilBytes =
        (globalThis.window.__coilBytes ?? 0) + incoming.data.byteLength;
      active.write(new Uint8Array(incoming.data));
      unacked += incoming.data.byteLength;

      if (unacked >= TERMINAL_ACK_EVERY_BYTES) {
        const acknowledged = unacked;

        unacked = 0;
        requestAnimationFrame(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ack: acknowledged }));
        });
      }
    };
    ws.onclose = (event) => {
      socket = null;

      if (closed) return;

      if (event.code === 1000) {
        const again = document.createElement('button');

        again.textContent = 'New shell';
        again.onclick = () => {
          showStatus(spinnerNode(), 'Starting a new shell');
          void open();
        };
        showStatus('Shell exited. ', again);

        return;
      }

      retry += 1;
      showStatus(spinnerNode(), retry > 1 ? 'Reconnecting…' : 'Starting the computer…');
      retryTimer = setTimeout(() => void open(), Math.min(MAX_RETRY_MS, 500 * 2 ** retry));
    };
  };

  open().catch((cause: unknown) =>
    showStatus(`Terminal failed: ${cause instanceof Error ? cause.message : String(cause)}`),
  );

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    observer?.disconnect();
    socket?.close();
    term?.destroy();
  };
};
