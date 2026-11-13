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

test('a chat-only thread answers without ever starting a computer', {
  timeout: 60_000,
}, async () => {
  const response = await worker.fetch(
    `http://coil/cloud5-lazy?run=${crypto.randomUUID().slice(0, 8)}`,
  );
  const out = (await response.json()) as {
    answer: string;
    bootsAfterCreate: number;
    bootsAfterChat: number;
    runningAfterChat: boolean;
    bootsAfterExec: number;
  };

  expect(out.answer).toBe('Done.');
  expect(out.bootsAfterCreate).toBe(0);
  expect(out.bootsAfterChat).toBe(0);
  expect(out.runningAfterChat).toBe(false);
  expect(out.bootsAfterExec).toBe(1);
});
