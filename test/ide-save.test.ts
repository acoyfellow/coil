import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';

describe('the IDE saves through the RPC without starting the computer', () => {
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

  test('ReadFile then WriteFile round-trips, keeps the box asleep, refuses escapes, and lands on disk', {
    timeout: 90_000,
  }, async () => {
    const response = await worker.fetch(
      `http://coil/ide-save?run=${crypto.randomUUID().slice(0, 8)}`,
    );
    const out = (await response.json()) as Record<string, unknown>;

    expect(out.opened).toEqual({ _tag: 'Success', value: 'export const a = 1;\n' });
    expect(out.saved).toMatchObject({ _tag: 'Success', value: { path: '/workspace/src/app.ts' } });
    expect(out.reread).toEqual({ _tag: 'Success', value: 'export const a = 2;\n' });
    expect(out.bootsAfterSave).toBe(0);
    expect(out.escape).toBe('Failure');
    expect(out.stranger).toBe('Failure');
    expect(out.onDisk).toBe('export const a = 2;\n');
  });
});
