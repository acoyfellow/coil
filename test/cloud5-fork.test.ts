import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';

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

test('a fork of a thread that wrote while asleep still reads the parent file', {
  timeout: 60_000,
}, async () => {
  const response = await worker.fetch(
    `http://coil/directory-fork-child?run=${crypto.randomUUID().slice(0, 8)}`,
  );
  const out = (await response.json()) as { forkSees: string | null };

  expect(out.forkSees).toBe('the plan');
});
