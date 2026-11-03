import { describe, expect, it } from 'vitest';
import { Browser, normalizeUrl, nulFrames, restorableUrl, worthRemembering } from '../src/browser';
import { inWorkspace } from '../src/env';
import {
  bounded,
  boundedShell,
  HUMAN_LIMIT_SECONDS,
  OUTPUT_CAP_BYTES,
  RUN_LIMIT_SECONDS,
  TIMED_OUT_EXIT,
} from '../src/shell';
import { parseSize, resizeRequest, SESSION, tmuxArgs } from '../src/terminal';

describe('browser pipe framing', () => {
  it('splits NUL-separated CDP messages across chunk boundaries', () => {
    const split = nulFrames();
    const encode = (s: string) => new TextEncoder().encode(s);

    expect(split(encode('{"id":1}\0{"id"'))).toEqual(['{"id":1}']);
    expect(split(encode(':2}\0'))).toEqual(['{"id":2}']);
    expect(split(encode(''))).toEqual([]);
  });

  it('keeps multi-byte characters split across chunks intact', () => {
    const split = nulFrames();
    const bytes = new TextEncoder().encode('{"t":"é"}\0');

    expect(split(bytes.slice(0, 7))).toEqual([]);
    expect(split(bytes.slice(7))).toEqual(['{"t":"é"}']);
  });
});

describe('browser URLs', () => {
  it('treats host:port as a host, not a scheme', () => {
    expect(normalizeUrl('localhost:8080')).toBe('http://localhost:8080');
    expect(normalizeUrl(' example.com/a ')).toBe('http://example.com/a');
  });

  it('keeps real schemes', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeUrl('about:blank')).toBe('about:blank');
  });
});

describe('restoring the browser after a restart', () => {
  it('reopens the last real page', () => {
    expect(restorableUrl('http://localhost:3000/')).toBe('http://localhost:3000/');
    expect(restorableUrl(' https://example.com/a ')).toBe('https://example.com/a');
  });

  it('does not restore a blank or internal page', () => {
    expect(restorableUrl('')).toBeNull();
    expect(restorableUrl('about:blank')).toBeNull();
    expect(restorableUrl('chrome://newtab/')).toBeNull();
    expect(restorableUrl('data:text/html,x')).toBeNull();
  });

  it('only remembers pages worth coming back to, so about:blank never overwrites the last URL', () => {
    expect(worthRemembering('http://localhost:3000/')).toBe(true);
    expect(worthRemembering('about:blank')).toBe(false);
  });
});

describe('terminal sessions', () => {
  it('accepts sane sizes and rejects bad ones', () => {
    expect(parseSize('80', '24')).toEqual({ cols: 80, rows: 24 });
    expect(parseSize(1, 24)).toBeNull();
    expect(parseSize(80, 9999)).toBeNull();
    expect(parseSize('8.5', 24)).toBeNull();
  });

  it('reads resize control frames and ignores junk', () => {
    expect(resizeRequest('{"resize":[120,40]}')).toEqual({ cols: 120, rows: 40 });
    expect(resizeRequest('not json')).toBeNull();
    expect(resizeRequest('{"resize":[0,0]}')).toBeNull();
  });

  it('only allows plain session names', () => {
    expect(SESSION.test('t1')).toBe(true);
    expect(SESSION.test('t1;rm')).toBe(false);
    expect(SESSION.test('a.b')).toBe(false);
  });

  it('passes the session name as an argument, never inside the script', () => {
    const args = tmuxArgs('t2');

    expect(args.at(-1)).toBe('t2');
    expect(args[2]).not.toContain('t2');
    expect(args[2]).toContain('new-session -A');
    expect(args[2]).toContain('capture-pane');
  });
});

describe('bounded shell', () => {
  it('wraps the command with a time limit, no stdin, and capped output', () => {
    const argv = boundedShell('npm run dev &');

    expect(argv.slice(0, 2)).toEqual(['bash', '-c']);
    expect(argv.slice(3)).toEqual([
      'bounded',
      String(RUN_LIMIT_SECONDS),
      'bash',
      '-lc',
      'npm run dev &',
    ]);
    expect(argv[2]).toContain('timeout --kill-after=5 "$limit" "$@"');
    expect(argv[2]).toContain(`head -c ${OUTPUT_CAP_BYTES}`);
    expect(TIMED_OUT_EXIT).toBe(124);
  });

  it('gives humans a longer limit than the agent', () => {
    expect(bounded(['ls'], HUMAN_LIMIT_SECONDS)[4]).toBe(String(HUMAN_LIMIT_SECONDS));
    expect(HUMAN_LIMIT_SECONDS).toBeGreaterThan(RUN_LIMIT_SECONDS);
  });
});

describe('workspace paths', () => {
  it('keeps dot-files and dot-folders such as .git', () => {
    expect(inWorkspace('.git')).toBe('/workspace/.git');
    expect(inWorkspace('.github/workflows')).toBe('/workspace/.github/workflows');
    expect(inWorkspace('./src/a.ts')).toBe('/workspace/src/a.ts');
    expect(inWorkspace('.')).toBe('/workspace');
    expect(inWorkspace('')).toBe('/workspace');
    expect(inWorkspace('/etc/hosts')).toBe('/etc/hosts');
  });
});

const fakeHost = () => {
  const toBrowser = new TransformStream<Uint8Array, Uint8Array>();
  const fromBrowser: string[] = [];
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const writer = toBrowser.writable.getWriter();
  let exit: (code: number) => void = () => undefined;
  const exitCode = new Promise<number>((resolve) => {
    exit = resolve;
  });
  const stdin = new WritableStream<Uint8Array>({
    write: (chunk) => {
      fromBrowser.push(...decoder.decode(chunk).split('\0').filter(Boolean));
    },
  });
  const say = (message: unknown) => writer.write(encoder.encode(`${JSON.stringify(message)}\0`));

  return {
    process: { stdin, stdout: toBrowser.readable, exitCode },
    sent: () =>
      fromBrowser.map(
        (frame) => JSON.parse(frame) as { id: number; method: string; params: unknown },
      ),
    say,
    exit,
  };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the WebKit host protocol', () => {
  it('is ready on the host ready event and opens a bare host over http', async () => {
    const host = fakeHost();
    const browser = new Browser(host.process);

    await host.say({ method: 'ready', params: { url: 'about:blank', title: '' } });
    await browser.ready;

    const opening = browser.open('localhost:3000');

    await flush();
    expect(host.sent()[0]).toMatchObject({
      method: 'open',
      params: { url: 'http://localhost:3000' },
    });

    await host.say({ method: 'load', params: { url: 'http://localhost:3000/', title: 'Home' } });
    await host.say({
      id: host.sent()[0]?.id,
      result: { url: 'http://localhost:3000/', title: 'Home' },
    });

    await expect(opening).resolves.toEqual({ url: 'http://localhost:3000/', title: 'Home' });
  });

  it('keeps console lines the page wrote, including during load', async () => {
    const host = fakeHost();
    const browser = new Browser(host.process);

    await host.say({ method: 'console', params: { type: 'log', text: 'fixture ready' } });
    await host.say({ method: 'console', params: { type: 'error', text: 'boom' } });
    await flush();

    expect(browser.consoleLogs(true)).toEqual(['[log] fixture ready', '[error] boom']);
    expect(browser.consoleLogs(false)).toEqual([]);
  });

  it('reports a host error as a rejected call', async () => {
    const host = fakeHost();
    const browser = new Browser(host.process);
    const typing = browser.type('ada');

    await flush();
    await host.say({ id: host.sent()[0]?.id, error: { message: 'no editable element has focus' } });

    await expect(typing).rejects.toThrow('no editable element has focus');
  });

  it('round-trips the cookie jar, HttpOnly included', async () => {
    const host = fakeHost();
    const browser = new Browser(host.process);
    const jar = [
      {
        name: 'sid',
        value: 'abc',
        domain: 'example.com',
        path: '/',
        expires: null,
        httpOnly: true,
        secure: true,
      },
    ];
    const reading = browser.cookies();

    await flush();
    await host.say({ id: host.sent()[0]?.id, result: { cookies: jar } });
    await expect(reading).resolves.toEqual(jar);

    const writing = browser.setCookies(jar);

    await flush();
    expect(host.sent()[1]).toMatchObject({ method: 'setCookies', params: { cookies: jar } });
    await host.say({ id: host.sent()[1]?.id, result: { count: 1 } });
    await expect(writing).resolves.toBeUndefined();
  });
});

describe('closing the browser', () => {
  it('fails calls that are waiting and tells every viewer, instead of hanging', async () => {
    const host = fakeHost();
    let stopped = false;
    const browser = new Browser(host.process, () => {
      stopped = true;
    });
    let viewerClosed = false;

    browser.closedListeners.add(() => {
      viewerClosed = true;
    });

    const pending = browser.evaluate('1 + 1');

    browser.close();

    await expect(pending).rejects.toThrow('browser exited');
    expect(viewerClosed).toBe(true);
    expect(stopped).toBe(true);
    expect(browser.alive).toBe(false);
  });

  it('rejects every call after the browser process exits', async () => {
    const host = fakeHost();
    const browser = new Browser(host.process);

    host.exit(137);
    await flush();

    await expect(browser.open('localhost:3000')).rejects.toThrow('browser exited');
    await expect(browser.screenshot()).rejects.toThrow('browser exited');
  });
});

describe('browser launch', () => {
  it('runs one headed WebKit on a virtual display shared over VNC, with no Chromium', async () => {
    const { browserArgs } = await import('../src/browser');
    const script = browserArgs().join(' ');

    expect(script).toContain('Xvfb :99');
    expect(script).toContain('x11vnc -display :99 -rfbport 5900');
    expect(script).toContain(
      'DISPLAY=:99 COIL_PROTOCOL_FD=3 exec dbus-run-session -- python3 -u /opt/coil/webkit-host.py',
    );
    expect(script).not.toContain('chromium');
    expect(script).not.toContain('pkill -f');
  });
});
