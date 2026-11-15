import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import { withPending } from '../src/workspace-store';

describe('files saved while asleep', () => {
  test('withPending marks held files and keeps disk files plain', () => {
    const merged = withPending(
      [
        { name: 'src', type: 'directory' },
        { name: 'README.md', type: 'file' },
      ],
      [
        { name: 'README.md', type: 'file', pending: true },
        { name: 'plan.md', type: 'file', pending: true },
      ],
    );

    expect(merged).toEqual([
      { name: 'src', type: 'directory' },
      { name: 'plan.md', type: 'file', pending: true },
      { name: 'README.md', type: 'file', pending: true },
    ]);
  });
});

describe('the file tree marks files saved while asleep until the computer starts', () => {
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

  test('asleep: ListDir says pending; after boot the same file is plain', {
    timeout: 90_000,
  }, async () => {
    const response = await worker.fetch(
      `http://coil/asleep-pending?run=${crypto.randomUUID().slice(0, 8)}`,
    );
    const out = (await response.json()) as Record<string, unknown>;

    expect(out.bootsWhileAsleep).toBe(0);
    expect(out.rootAsleep).toEqual({
      _tag: 'Success',
      value: [{ name: 'notes', type: 'directory', pending: true }],
    });
    expect(out.notesAsleep).toEqual({
      _tag: 'Success',
      value: [{ name: 'plan.md', type: 'file', pending: true }],
    });
    const awake = out.notesAwake as { _tag: string; value: { name: string; pending?: boolean }[] };

    expect(awake._tag).toBe('Success');
    expect(awake.value.some((entry) => entry.name.endsWith('plan.md'))).toBe(true);
    expect(awake.value.some((entry) => entry.pending === true)).toBe(false);
  });
});
