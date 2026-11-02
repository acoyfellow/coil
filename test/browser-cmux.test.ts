import { describe, expect, it } from 'vitest';

const SLASHES = '/'.repeat(2);
const LOCAL = `http:${SLASHES}localhost:3000`;

import { cmuxBrowserTools, screenshotPathOf } from '../src/browser-cmux';

const recorder = (replies: Record<string, string> = {}) => {
  const calls: string[][] = [];
  const run = async (argv: readonly string[]) => {
    calls.push([...argv]);
    return replies[argv.slice(2).join(' ')] ?? replies[argv[2] ?? ''] ?? 'OK';
  };
  return { calls, run };
};

describe('cmux browser tools', () => {
  it('opens a bare host over http and waits for load', async () => {
    const { calls, run } = recorder({ 'get title': 'Home', url: `${LOCAL}/` });
    const reply = await cmuxBrowserTools(run, 'surface:9').open('localhost:3000');

    expect(calls[0]).toEqual(['browser', 'surface:9', 'goto', LOCAL]);
    expect(calls[1]).toEqual([
      'browser',
      'surface:9',
      'wait',
      '--load-state',
      'complete',
      '--timeout',
      '15',
    ]);
    expect(reply).toBe(`Home\n${LOCAL}/`);
  });

  it('fills a ref, and types into the focused element without one', async () => {
    const { calls, run } = recorder();
    const tools = cmuxBrowserTools(run, 'surface:9');

    await tools.type('ada', 'e4');
    await tools.type('lovelace');

    expect(calls).toEqual([
      ['browser', 'surface:9', 'fill', 'e4', 'ada'],
      ['browser', 'surface:9', 'type', ':focus', 'lovelace'],
    ]);
  });

  it('clears the console only after reading it', async () => {
    const { calls, run } = recorder({ 'console list': '[log] ready' });

    expect(await cmuxBrowserTools(run, 'surface:9').logs(true)).toBe('[log] ready');
    expect(calls.map((call) => call.slice(2).join(' '))).toEqual(['console list', 'console clear']);
  });

  it('reports an empty console the same way as the cloud browser', async () => {
    const { run } = recorder({ 'console list': 'No console entries' });

    expect(await cmuxBrowserTools(run, 'surface:9').logs(false)).toBe('(no console messages)');
  });

  it('passes the screenshot file path to the describer', async () => {
    const { run } = recorder({
      screenshot: `OK file:${SLASHES}/var/tmp/shot%20one.png`,
      'get title': 'T',
      url: 'u',
    });
    const seen: string[] = [];
    const tools = cmuxBrowserTools(run, 'surface:9', async (path, question) => {
      seen.push(path, question);
      return 'a counter showing 3';
    });

    expect(await tools.look('is it 3?')).toBe('T\nu\na counter showing 3');
    expect(seen).toEqual(['/var/tmp/shot one.png', 'is it 3?']);
  });

  it('lets a cmux error reach the agent instead of a false success', async () => {
    const tools = cmuxBrowserTools(async () => {
      throw new Error('invalid_params: Surface is not a browser');
    }, 'surface:1');

    await expect(tools.click('e1')).rejects.toThrow('Surface is not a browser');
  });
});

describe('screenshot path', () => {
  it('reads a plain path reply too', () => {
    expect(screenshotPathOf('/tmp/a.png')).toBe('/tmp/a.png');
  });
});
