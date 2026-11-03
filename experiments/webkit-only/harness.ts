import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { Readable, Writable } from 'node:stream';
import { Browser, browserArgs, browserEnv, displayArgs } from '../../src/browser.ts';
import {
  type BrowserCookie,
  WEBKIT_PIDFILE,
  WebKitBrowser,
  webkitCommand,
  webkitEnv,
} from '../../src/browser-webkit.ts';

type Arm = 'chrome' | 'webkit';
type Engine = {
  open: (url: string) => Promise<unknown>;
  snapshot: () => Promise<string>;
  clickRef: (ref: string) => Promise<void>;
  type: (text: string) => Promise<void>;
  key: (event: { type: 'keyDown' | 'keyUp'; key: string; code: string; keyCode?: number }) => Promise<void>;
  evaluate: (expression: string) => Promise<string>;
  screenshot: () => Promise<string>;
  consoleLogs: (clear: boolean) => string[];
  back: () => Promise<void>;
  close: () => void;
  readonly alive: boolean;
};
type Result = { task: string; ok: boolean; detail: string };

const arm = process.argv[2] as Arm;
const KEY_CODES: Record<string, number> = { Enter: 13, Tab: 9 };
const DISPLAY = ':99';
const PORT = 8000;
const SITE = ['http:', '', `127.0.0.1:${PORT}`].join('/');

const FIXTURE = `<!doctype html><title>coil fixture</title>
<h1 id=count>0</h1>
<button id=plus onclick="count.textContent = Number(count.textContent) + 1">plus</button>
<button id=log onclick="console.log('clicked log')">log</button>
<form onsubmit="event.preventDefault(); document.title = 'sent ' + document.getElementById('name').value"><input id=name aria-label="name"><button>send</button></form>
<a href="/second">second page</a>
<script>console.log('fixture ready')</script>`;

createServer((request, response) => {
  const path = new URL(request.url ?? '/', SITE).pathname;
  const signedIn = (request.headers.cookie ?? '').includes('sid=abc123');

  if (path === '/login') {
    response.writeHead(200, { 'set-cookie': 'sid=abc123; Max-Age=86400; Path=/; HttpOnly', 'content-type': 'text/html' });
    response.end('<title>logged in</title>');
  } else if (path === '/account') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<title>${signedIn ? 'IN' : 'OUT'}</title>`);
  } else if (path === '/second') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>second</title><p>arrived</p>');
  } else {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(FIXTURE);
  }
}).listen(PORT, '127.0.0.1');

const run = (argv: readonly string[], env: Record<string, string>) => {
  const child = spawn(argv[0] as string, argv.slice(1), {
    env: { ...process.env, ...env, PATH: process.env.PATH ?? '/usr/bin:/bin' },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const exitCode = new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 1)));

  return {
    child,
    pipes: {
      stdin: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      exitCode,
    },
  };
};

const startDisplay = async () => {
  if (spawnSync('pgrep', ['-x', 'Xvfb']).status === 0) return;
  const display = spawn(displayArgs()[0] as string, displayArgs().slice(1), {
    env: { ...process.env, ...browserEnv(), PATH: process.env.PATH ?? '/usr/bin:/bin' },
    stdio: 'ignore',
  });

  await new Promise((resolve) => display.on('exit', resolve));
  display.unref();
};

let killBrowser: () => unknown = () => undefined;

const launch = async (): Promise<Engine> => {
  if (arm === 'chrome') {
    const { child, pipes } = run(browserArgs(), browserEnv());
    const abort = new AbortController();

    abort.signal.addEventListener('abort', () => child.kill('SIGKILL'));
    killBrowser = () => spawnSync('pkill', ['-9', '-f', '/usr/lib/chromium/chromium ']);

    const browser = new Browser(pipes as never, abort);

    await (browser as unknown as { attach: () => Promise<void> }).attach();

    return browser as unknown as Engine;
  }

  await startDisplay();
  trace('display');

  const { child, pipes } = run(['bash', '-c', webkitCommand(DISPLAY)], webkitEnv());
  const browser = new WebKitBrowser(pipes, () => child.kill('SIGKILL'));

  killBrowser = () => spawnSync('bash', ['-c', `kill -9 "$(cat ${WEBKIT_PIDFILE})"`]);
  await browser.ready;

  return browser as unknown as Engine;
};

const refFor = (snapshot: string, name: string) => {
  const line = snapshot.split('\n').find((row) => row.includes(`"${name}"`));
  const ref = line?.split(' ')[0];

  if (!ref?.startsWith('e')) throw new Error(`no ref for ${name}`);

  return ref;
};

const press = async (engine: Engine, key: string) => {
  await engine.key({ type: 'keyDown', key, code: key, keyCode: KEY_CODES[key] });
  await engine.key({ type: 'keyUp', key, code: key, keyCode: KEY_CODES[key] });
  await new Promise((resolve) => setTimeout(resolve, 300));
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

const pressWithText = async (engine: Engine, key: string, text: string) => {
  const raw = engine as unknown as { key: (event: Record<string, unknown>) => Promise<void> };

  await raw.key({ type: 'keyDown', key, code: key, keyCode: KEY_CODES[key], text });
  await raw.key({ type: 'keyUp', key, code: key, keyCode: KEY_CODES[key] });
  await new Promise((resolve) => setTimeout(resolve, 300));
};

const cookieJar = async (engine: Engine): Promise<BrowserCookie[]> => {
  if (engine instanceof WebKitBrowser) return engine.cookies();

  const chrome = engine as unknown as {
    send: (method: string, params?: Record<string, unknown>) => Promise<{ result?: { cookies?: BrowserCookie[] } }>;
  };
  const reply = await chrome.send('Network.getAllCookies');

  return (reply.result?.cookies ?? []).map((cookie) => ({ ...cookie, expires: (cookie as { expires?: number }).expires ?? null }));
};

const restoreJar = async (engine: Engine, jar: readonly BrowserCookie[]) => {
  if (engine instanceof WebKitBrowser) return engine.setCookies(jar);

  const chrome = engine as unknown as { send: (method: string, params?: Record<string, unknown>) => Promise<unknown> };

  await chrome.send('Network.setCookies', {
    cookies: jar.map((cookie) => ({ ...cookie, expires: cookie.expires ?? undefined })),
  });
};

const results: Result[] = [];
const timings: Record<string, number[]> = {};
const timed = <T>(name: string, work: () => Promise<T>) => {
  const started = performance.now();

  return work().finally(() => {
    (timings[name] ??= []).push(performance.now() - started);
  });
};

const check = async (task: string, body: () => Promise<true | string>) => {
  try {
    const verdict = await body();

    results.push({ task, ok: verdict === true, detail: verdict === true ? 'ok' : verdict });
  } catch (error) {
    results.push({ task, ok: false, detail: String((error as Error).message ?? error).slice(0, 200) });
  }
};

const trace = (step: string) => process.stderr.write(`trace ${step} ${Math.round(performance.now())}\n`);
trace('begin');
const coldStarted = performance.now();
let engine = await launch();
trace('launched');

await engine.open(`${SITE}/`);

const coldStartMs = performance.now() - coldStarted;
const timedEngine: Engine = {
  ...engine,
  alive: engine.alive,
  open: (url) => timed('open', () => engine.open(url)),
  snapshot: () => timed('snapshot', () => engine.snapshot()),
  clickRef: (ref) => timed('clickRef', () => engine.clickRef(ref)),
  type: (text) => timed('type', () => engine.type(text)),
  key: (event) => timed('key', () => engine.key(event)),
  evaluate: (expression) => timed('evaluate', () => engine.evaluate(expression)),
  screenshot: () => timed('screenshot', () => engine.screenshot()),
  consoleLogs: (clear) => engine.consoleLogs(clear),
  back: () => timed('back', () => engine.back()),
  close: () => engine.close(),
};
const e = timedEngine;

await check('open-local', async () => {
  await e.open(`127.0.0.1:${PORT}/`.replace(/^/, 'http://'));
  const href = await e.evaluate('location.href');

  return href.startsWith(SITE) || `href ${href}`;
});

await check('click-three-times', async () => {
  await e.open(`${SITE}/`);
  for (let i = 0; i < 3; i++) {
    await e.clickRef(refFor(await e.snapshot(), 'plus'));
    await settle();
  }
  const count = await e.evaluate('document.getElementById("count").textContent');

  return count === '3' || `count ${count}`;
});

await check('type-into-ref', async () => {
  await e.open(`${SITE}/`);
  await e.clickRef(refFor(await e.snapshot(), 'name'));
  await e.type('jordan');
  const value = await e.evaluate('document.getElementById("name").value');

  return value === 'jordan' || `value ${value}`;
});

await check('enter-submits', async () => {
  await e.open(`${SITE}/`);
  await e.clickRef(refFor(await e.snapshot(), 'name'));
  await e.type('ada');
  await press(e, 'Enter');
  const title = await e.evaluate('document.title');

  return title === 'sent ada' || `title ${title}`;
});

await check('enter-with-text-submits', async () => {
  await e.open(`${SITE}/`);
  await e.clickRef(refFor(await e.snapshot(), 'name'));
  await e.type('ada');
  await pressWithText(engine, 'Enter', '\r');
  const title = await e.evaluate('document.title');

  return title === 'sent ada' || `title ${title}`;
});

await check('follow-link', async () => {
  await e.open(`${SITE}/`);
  await e.clickRef(refFor(await e.snapshot(), 'second page'));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const path = await e.evaluate('location.pathname');

  return path === '/second' || `path ${path}`;
});

await check('back', async () => {
  await e.back();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const path = await e.evaluate('location.pathname');

  return path === '/' || `path ${path}`;
});

await check('logs-after-click', async () => {
  await e.open(`${SITE}/`);
  e.consoleLogs(true);
  await e.clickRef(refFor(await e.snapshot(), 'log'));
  await settle();
  const logs = e.consoleLogs(false).join('\n');

  return logs.includes('clicked log') || `logs ${logs.slice(0, 120)}`;
});

await check('logs-during-load', async () => {
  e.consoleLogs(true);
  await e.open(`${SITE}/?again`);
  await settle();
  const logs = e.consoleLogs(false).join('\n');

  return logs.includes('fixture ready') || `logs ${logs.slice(0, 120)}`;
});

await check('screenshot', async () => {
  const bytes = Buffer.from(await e.screenshot(), 'base64');

  return bytes.length >= 1000 || `bytes ${bytes.length}`;
});

await check('login-survives-restart', async () => {
  await engine.open(`${SITE}/login`);
  await engine.open(`${SITE}/account`);
  if (engine.page === undefined) return 'no page';
  const before = await engine.evaluate('document.title');
  const jar = await cookieJar(engine);

  engine.close();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  spawn('bash', ['-c', 'rm -rf /root/.browser /root/.browser-webkit']);
  await new Promise((resolve) => setTimeout(resolve, 500));
  engine = await launch();
  await engine.open(`${SITE}/blank`);
  await restoreJar(engine, jar);
  await engine.open(`${SITE}/account`);
  const after = await engine.evaluate('document.title');
  const httpOnly = jar.some((cookie) => cookie.name === 'sid' && cookie.httpOnly);

  return (before === 'IN' && after === 'IN' && httpOnly) || `before ${before} after ${after} httpOnly ${httpOnly}`;
});

const disproof: string[] = [];

const running = () =>
  arm === 'chrome'
    ? spawnSync('pgrep', ['-f', '/usr/lib/chromium/chromium ']).status === 0
    : spawnSync('bash', ['-c', `kill -0 "$(cat ${WEBKIT_PIDFILE})"`]).status === 0;
const runningBefore = running();

killBrowser();
await new Promise((resolve) => setTimeout(resolve, 1500));

const runningAfter = running();

disproof.push(`killed:${runningBefore && !runningAfter ? 'yes' : `no(before=${runningBefore},after=${runningAfter})`}`);

for (const [name, attempt] of [
  ['open', () => engine.open(`${SITE}/`)],
  ['evaluate', () => engine.evaluate('1 + 1')],
  ['snapshot', () => engine.snapshot()],
  ['screenshot', () => engine.screenshot()],
] as const) {
  const outcome = await Promise.race([
    (attempt as () => Promise<unknown>)().then(
      () => 'FALSE-SUCCESS',
      () => 'rejected',
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('hung'), 20_000)),
  ]);

  disproof.push(`${name}:${outcome}`);
}

console.log(JSON.stringify({ arm, coldStartMs: Math.round(coldStartMs), results, timings, disproof }));
process.exit(0);
