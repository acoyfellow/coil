import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import { walkFiles } from '../src/workspace-store';

describe('editor quick open lists workspace files', () => {
  test('walkFiles goes deep, skips node_modules and .git, and stops at the limit', async () => {
    const tree: Record<string, { name: string; type: string }[]> = {
      '.': [
        { name: 'src', type: 'directory' },
        { name: 'node_modules', type: 'directory' },
        { name: '.git', type: 'directory' },
        { name: 'README.md', type: 'file' },
      ],
      src: [
        { name: 'ui', type: 'directory' },
        { name: 'a.ts', type: 'file' },
      ],
      'src/ui': [{ name: 'b.ts', type: 'file' }],
    };
    const list = async (path: string) => tree[path] ?? [];

    expect(await walkFiles(list)).toEqual(['README.md', 'src/a.ts', 'src/ui/b.ts']);
    expect(await walkFiles(list, 2)).toHaveLength(2);
  });
});

describe('the ListFiles RPC', () => {
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

  test('editor ListFiles returns files saved while asleep without starting the computer', {
    timeout: 90_000,
  }, async () => {
    const response = await worker.fetch(
      `http://coil/ide-list?run=${crypto.randomUUID().slice(0, 8)}`,
    );
    const out = (await response.json()) as Record<string, unknown>;

    expect(out.asleep).toEqual({ _tag: 'Success', value: ['notes/b.md', 'src/a.ts'] });
    expect(out.bootsWhileListing).toBe(0);
  });
});
