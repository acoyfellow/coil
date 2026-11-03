import { SHELL_ENV } from './env';

export const VIEWPORT = { width: 1280, height: 800 } as const;

export const VNC_PORT = 5900;

export const DISPLAY = ':99';

const startDisplay = [
  'if ! pgrep -x Xvfb >/dev/null; then',
  '  rm -f /tmp/.X99-lock /tmp/.X11-unix/X99',
  `  setsid Xvfb ${DISPLAY} -screen 0 ${VIEWPORT.width}x${VIEWPORT.height}x24 -nolisten tcp -ac >/tmp/xvfb.log 2>&1 &`,
  'fi',
  'for i in $(seq 1 50); do [ -e /tmp/.X11-unix/X99 ] && break; sleep 0.1; done',
  `pgrep -x openbox >/dev/null || DISPLAY=${DISPLAY} setsid openbox >/tmp/openbox.log 2>&1 &`,
  `pgrep -x x11vnc >/dev/null || setsid x11vnc -display ${DISPLAY} -rfbport ${VNC_PORT} -forever -shared -nopw -noxdamage -quiet >/tmp/x11vnc.log 2>&1 &`,
  'true',
].join('\n');

export const displayArgs = () => ['bash', '-c', startDisplay];

export type PageState = { readonly url: string; readonly title: string };

export const nulFrames = () => {
  const decoder = new TextDecoder();
  let pending = '';

  return (chunk: Uint8Array): string[] => {
    pending += decoder.decode(chunk, { stream: true });
    const parts = pending.split('\0');

    pending = parts.pop() ?? '';

    return parts.filter((part) => part !== '');
  };
};

export const restorableUrl = (saved: string): string | null =>
  /^(https?|file):/i.test(saved.trim()) ? saved.trim() : null;

export const worthRemembering = (url: string): boolean => restorableUrl(url) !== null;

export const normalizeUrl = (input: string) => {
  const url = input.trim();

  return /^(https?|about|data|file):/i.test(url) ? url : `http://${url}`;
};

export const BROWSER_DID_NOT_START =
  'The browser did not start. Its log is /tmp/browser.log in the thread computer.';

export const WEBKIT_HOST = '/opt/coil/webkit-host.py';

export const TITLE_WAIT_MS = 150;

export const BROWSER_START_TIMEOUT_MS = 30_000;

export const WEBKIT_PIDFILE = '/tmp/coil-webkit.pid';

export const WEBKIT_ENV = {
  LIBGL_ALWAYS_SOFTWARE: '1',
  WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: '1',
  WEBKIT_DISABLE_COMPOSITING_MODE: '1',
  WEBKIT_DISABLE_DMABUF_RENDERER: '1',
  GDK_BACKEND: 'x11',
  NO_AT_BRIDGE: '1',
} as const;

export type BrowserCookie = {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires: number | null;
  readonly httpOnly: boolean;
  readonly secure: boolean;
};

type HostMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
};

export type HostPipes = {
  readonly stdin: WritableStream<Uint8Array> | null;
  readonly stdout: ReadableStream<Uint8Array> | null;
  readonly exitCode: Promise<number>;
};

const LOG_LINES = 200;

export const browserEnv = () => ({ ...SHELL_ENV, HOME: '/root', ...WEBKIT_ENV });

export const browserArgs = () => ['bash', '-c', `${startDisplay}\n${browserCommand(DISPLAY)}`];

export const browserCommand = (display: string) =>
  `[ -f ${WEBKIT_PIDFILE} ] && kill -9 "$(cat ${WEBKIT_PIDFILE})" 2>/dev/null; exec 3>&1 1>/tmp/browser.log 2>&1; DISPLAY=${display} COIL_PROTOCOL_FD=3 exec dbus-run-session -- python3 -u ${WEBKIT_HOST}`;

export const SNAPSHOT_SCRIPT = `(() => {
  const out = [];
  let n = 0;
  document.querySelectorAll('[data-coil-ref]').forEach((el) => el.removeAttribute('data-coil-ref'));
  for (const el of document.querySelectorAll('a,button,input,textarea,select,[role=button],[onclick],summary,label')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
    const ref = 'e' + (++n);
    el.setAttribute('data-coil-ref', ref);
    const text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    out.push(ref + ' ' + el.tagName.toLowerCase() + (el.type ? '[' + el.type + ']' : '') + ' "' + text + '" @' + Math.round(r.x + r.width / 2) + ',' + Math.round(r.y + r.height / 2));
    if (n >= 80) break;
  }
  const body = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 2500);
  return 'url: ' + location.href + '\\ntitle: ' + document.title + '\\n\\n' + out.join('\\n') + '\\n\\ntext:\\n' + body;
})()`;

export const refCenterScript = (ref: string) =>
  `(() => { const el = document.querySelector('[data-coil-ref="${ref.replace(/[^a-z0-9]/gi, '')}"]'); if (!el) return ''; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return Math.round(r.x + r.width / 2) + ',' + Math.round(r.y + r.height / 2); })()`;

export class Browser {
  private next = 0;
  private readonly waiting = new Map<number, (message: HostMessage) => void>();
  private readonly input: WritableStreamDefaultWriter<Uint8Array>;
  private readonly encoder = new TextEncoder();
  private closed = false;
  private logs: string[] = [];
  readonly ready: Promise<void>;
  private failReady: (cause: Error) => void = () => undefined;
  readonly closedListeners = new Set<() => void>();
  readonly pages = new Set<(page: PageState) => void>();
  page: PageState = { url: 'about:blank', title: '' };

  static async launch(container: Container): Promise<Browser> {
    const abort = new AbortController();
    const process = await container.exec(browserArgs(), {
      env: browserEnv(),
      cwd: '/root',
      signal: abort.signal,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const browser = new Browser(process, () => abort.abort());
    const timer = setTimeout(() => browser.close(), BROWSER_START_TIMEOUT_MS);

    try {
      await browser.ready;
    } finally {
      clearTimeout(timer);
    }

    return browser;
  }

  constructor(
    process: HostPipes,
    private readonly stop: () => void = () => undefined,
  ) {
    if (process.stdin === null || process.stdout === null)
      throw new Error('The browser did not return its pipes');

    this.input = process.stdin.getWriter();

    let markReady: () => void = () => undefined;
    let markFailed: (cause: Error) => void = () => undefined;

    this.ready = new Promise((resolve, reject) => {
      markReady = resolve;
      markFailed = reject;
    });
    this.ready.catch(() => undefined);
    this.failReady = markFailed;
    this.pump(process.stdout, markReady).catch(() => this.fail());
    process.exitCode.then(
      () => this.fail(),
      () => this.fail(),
    );
  }

  get alive() {
    return !this.closed;
  }

  private fail() {
    if (this.closed) return;

    this.closed = true;
    this.failReady(new Error(BROWSER_DID_NOT_START));

    for (const listener of this.closedListeners) listener();

    for (const resolve of this.waiting.values()) resolve({ error: { message: 'browser exited' } });

    this.waiting.clear();
  }

  private async pump(stdout: ReadableStream<Uint8Array>, markReady: () => void) {
    const split = nulFrames();

    try {
      for await (const chunk of stdout)
        for (const text of split(chunk)) this.dispatch(JSON.parse(text) as HostMessage, markReady);
    } finally {
      this.fail();
    }
  }

  private dispatch(message: HostMessage, markReady: () => void) {
    if (message.id !== undefined) {
      this.waiting.get(message.id)?.(message);
      this.waiting.delete(message.id);

      return;
    }

    const params = message.params ?? {};

    if (message.method === 'ready') {
      this.setPage(params);
      markReady();
    }

    if (message.method === 'page') this.setPage(params);

    if (message.method === 'load') this.setPage(params);

    if (message.method === 'console')
      this.remember(`[${String(params.type ?? 'log')}] ${String(params.text ?? '')}`);
  }

  private setPage(params: Record<string, unknown>) {
    const url = typeof params.url === 'string' ? params.url : this.page.url;
    const title = typeof params.title === 'string' ? params.title : this.page.title;

    if (url === this.page.url && title === this.page.title) return;

    this.page = { url, title };

    for (const listener of this.pages) listener(this.page);
  }

  private remember(line: string) {
    this.logs.push(line.slice(0, 2000));
    if (this.logs.length > LOG_LINES) this.logs.splice(0, this.logs.length - LOG_LINES);
  }

  consoleLogs(clear: boolean): string[] {
    const lines = [...this.logs];

    if (clear) this.logs = [];

    return lines;
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<HostMessage> {
    if (this.closed) return Promise.resolve({ error: { message: 'browser exited' } });

    const id = ++this.next;

    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.input
        .write(this.encoder.encode(`${JSON.stringify({ id, method, params })}\0`))
        .catch(() => resolve({ error: { message: 'browser pipe closed' } }));
    });
  }

  private async call(method: string, params: Record<string, unknown> = {}) {
    const reply = await this.send(method, params);

    if (reply.error) throw new Error(`${method}: ${reply.error.message}`);

    return reply.result ?? {};
  }

  async open(url: string): Promise<PageState> {
    const target = normalizeUrl(url);

    let loaded: Record<string, unknown>;

    try {
      loaded = await this.call('open', { url: target });
    } catch (cause) {
      throw new Error(`Could not open ${target}: ${(cause as Error).message}`);
    }

    if (typeof loaded.url === 'string' && typeof loaded.title === 'string')
      this.page = { url: loaded.url, title: loaded.title };

    if (this.page.title === '') await this.untilTitled(TITLE_WAIT_MS);

    if (this.page.title === '') {
      const title = await this.evaluate('document.title').catch(() => '');

      if (title !== '' && title !== 'null') this.page = { ...this.page, title };
    }

    return this.page;
  }

  private untilTitled(ms: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.pages.delete(watch);
        resolve();
      };
      const watch = (page: PageState) => {
        if (page.title !== '') done();
      };
      const timer = setTimeout(done, ms);

      this.pages.add(watch);
    });
  }

  async newTab(url = 'about:blank') {
    await this.open(url);
  }

  async back() {
    await this.call('back');
  }

  async forward() {
    await this.call('forward');
  }

  async reload() {
    await this.call('reload');
  }

  async click(x: number, y: number) {
    await this.call('click', { x, y });
  }

  async scroll(x: number, y: number, _dx: number, dy: number) {
    await this.call('scroll', { x, y, dy });
  }

  async key(event: { type: 'keyDown' | 'keyUp' | 'char'; key?: string }) {
    if (event.type !== 'keyDown' || event.key === undefined) return;

    await this.call('key', { key: event.key });
  }

  async type(text: string) {
    await this.call('type', { text });
  }

  async evaluate(expression: string): Promise<string> {
    const result = await this.call('evaluate', { expression });
    const value = result.value;

    return typeof value === 'string' ? value : JSON.stringify(value ?? null);
  }

  async snapshot(): Promise<string> {
    return this.evaluate(SNAPSHOT_SCRIPT);
  }

  async clickRef(ref: string) {
    const at = await this.evaluate(refCenterScript(ref));

    if (at === '' || at === 'null') throw new Error(`No element ${ref}. Take a new snapshot.`);

    const [x, y] = at.replace(/"/g, '').split(',').map(Number);

    await this.click(x ?? 0, y ?? 0);
  }

  async screenshot(): Promise<string> {
    const shot = await this.call('screenshot');

    return shot.data as string;
  }

  async cookies(): Promise<BrowserCookie[]> {
    const result = await this.call('getCookies');

    return (result.cookies ?? []) as BrowserCookie[];
  }

  async setCookies(cookies: readonly BrowserCookie[]) {
    await this.call('setCookies', { cookies });
  }

  close() {
    this.fail();
    this.stop();
  }
}
