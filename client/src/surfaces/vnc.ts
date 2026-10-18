import { nothingFocused, socketUrl, spinnerNode } from './dom';

type Rfb = {
  scaleViewport: boolean;
  resizeSession: boolean;
  clipViewport: boolean;
  focusOnClick: boolean;
  disconnect: () => void;
  focus: () => void;
  clipboardPasteFrom: (text: string) => void;
  addEventListener: (name: string, listener: (event: Event & { detail?: unknown }) => void) => void;
};

type RfbConstructor = new (target: HTMLElement, url: string) => Rfb;

export const vncPath = (thread: string) => `/api/threads/${thread}/vnc`;

const MAX_RETRY_MS = 8000;

export const attachVnc = (
  host: HTMLElement,
  thread: string,
  onError: (text: string) => void,
): (() => void) => {
  const stage = document.createElement('div');
  const status = document.createElement('div');
  let rfb: Rfb | null = null;
  let stopped = false;
  let retry = 500;
  let timer: ReturnType<typeof setTimeout> | undefined;

  stage.className = 'vnc-stage';
  status.className = 'browser-status';
  status.append(spinnerNode(), document.createTextNode(' Starting the browser…'));
  host.replaceChildren(stage, status);

  const connect = async () => {
    const module = (await import('@novnc/novnc')) as unknown as { default: RfbConstructor };

    if (stopped) return;

    const next = new module.default(stage, socketUrl(vncPath(thread)));

    next.scaleViewport = true;
    next.resizeSession = false;
    next.clipViewport = false;
    next.focusOnClick = true;
    next.addEventListener('connect', () => {
      retry = 500;
      status.hidden = true;
      if (nothingFocused()) next.focus();
    });
    next.addEventListener('disconnect', () => {
      rfb = null;

      if (stopped) return;

      status.hidden = false;
      timer = setTimeout(() => void connect().catch(fail), retry);
      retry = Math.min(retry * 2, MAX_RETRY_MS);
    });
    rfb = next;
  };

  const fail = (cause: unknown) => onError(cause instanceof Error ? cause.message : String(cause));

  const paste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain');

    if (rfb !== null && text) rfb.clipboardPasteFrom(text);
  };

  stage.addEventListener('paste', paste);
  void connect().catch(fail);

  return () => {
    stopped = true;
    clearTimeout(timer);
    stage.removeEventListener('paste', paste);
    rfb?.disconnect();
  };
};
