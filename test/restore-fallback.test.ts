import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';

describe('a saved disk that will not start does not lock the thread out', () => {
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

  test('restore fallback: older disk first, then a clean computer, each noted in the thread', {
    timeout: 90_000,
  }, async () => {
    const response = await worker.fetch(
      `http://coil/restore-fallback?run=${crypto.randomUUID().slice(0, 8)}`,
    );
    const out = (await response.json()) as {
      olderDisk: string;
      olderNotes: string[];
      cleanDisk: string;
      cleanNotes: string[];
      running: boolean;
    };

    expect(out.olderNotes).toHaveLength(1);
    expect(out.olderNotes[0]).toContain('newer saved disk would not start');
    expect(out.cleanNotes).toHaveLength(2);
    expect(out.cleanNotes[1]).toContain('clean computer');
    expect(out.cleanDisk).toBe('');
  });
});
