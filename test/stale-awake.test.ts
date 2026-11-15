import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';

describe('a thread whose computer stopped on its own is not shown as awake', () => {
  let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

  beforeAll(async () => {
    worker = await unstable_startWorker({
      config: resolve('test/worker/wrangler.jsonc'),
      dev: { server: { port: 0 }, inspector: false, logLevel: 'error', persist: false },
    });
  }, 60_000);

  afterAll(async () => {
    await worker.dispose();
  });

  test('stale awake: the idle alarm marks a stopped computer paused in the list', {
    timeout: 90_000,
  }, async () => {
    const response = await worker.fetch(
      `http://coil/stale-awake?run=${crypto.randomUUID().slice(0, 8)}`,
    );
    const out = (await response.json()) as Record<string, unknown>;

    expect(out.before).toBe('awake');
    expect(out.after).toBe('paused');
    expect(out.viewPhase).toBe('paused');
    expect(out.running).toBe(false);
    expect(out.healedByList).toBe('paused');
  });
});
