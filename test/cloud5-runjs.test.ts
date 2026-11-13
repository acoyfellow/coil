import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import { type RunJsResult, runJsModule } from '../src/run-js';

describe('run_js module', () => {
  test('the code runs inside an async body with fs and console', () => {
    const module = runJsModule('return 1;');

    expect(module).toContain('return 1;');
    expect(module).toContain('const fs = Object.freeze');
    expect(module).toContain('const console = ');
  });
});

describe('run_js on a thread', () => {
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

  test('runs code over thread files in an isolate with no network and no computer', {
    timeout: 60_000,
  }, async () => {
    const response = await worker.fetch(
      `http://coil/cloud5-runjs?run=${crypto.randomUUID().slice(0, 8)}`,
    );
    const out = (await response.json()) as {
      summed: RunJsResult;
      sealedNet: RunJsResult;
      thrown: RunJsResult;
      total: string;
      boots: number;
    };

    expect(out.summed.ok).toBe(true);
    expect(out.summed.result).toBe(12);
    expect(out.summed.output).toBe('sum 12');
    expect(out.summed.written).toEqual({ 'total.txt': '12' });
    expect(out.total).toBe('12');
    expect(out.sealedNet.ok).toBe(false);
    expect(out.thrown).toMatchObject({ ok: false, error: 'boom' });
    expect(out.boots).toBe(0);
  });
});
