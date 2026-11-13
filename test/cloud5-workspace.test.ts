import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import { listUnder, normalizePath } from '../src/workspace-store';

describe('workspace paths', () => {
  test('paths are relative to the workspace and cannot escape it', () => {
    expect(normalizePath('/workspace/a/./b.txt')).toBe('a/b.txt');
    expect(normalizePath('./notes/plan.md')).toBe('notes/plan.md');
    expect(() => normalizePath('../etc/passwd')).toThrowError('escapes the workspace');
  });

  test('a listing shows directories before files, one level deep', () => {
    expect(listUnder(['b.txt', 'notes/plan.md', 'notes/deep/x.md', 'a.txt'], '.')).toEqual([
      { name: 'notes', type: 'directory' },
      { name: 'a.txt', type: 'file' },
      { name: 'b.txt', type: 'file' },
    ]);
    expect(listUnder(['notes/plan.md', 'notes/deep/x.md'], 'notes')).toEqual([
      { name: 'deep', type: 'directory' },
      { name: 'plan.md', type: 'file' },
    ]);
  });
});

describe('workspace outside the box', () => {
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

  test('files written while asleep are read back without a boot, then land on disk', {
    timeout: 60_000,
  }, async () => {
    const response = await worker.fetch(
      `http://coil/cloud5-workspace?run=${crypto.randomUUID().slice(0, 8)}`,
    );
    const out = (await response.json()) as {
      read: string;
      root: { name: string; type: string }[];
      bootsWhileAsleep: number;
      heldBeforeBoot: string[];
      onDisk: string;
      heldAfterBoot: number;
      sealed: boolean;
    };

    expect(out.read).toBe('# plan');
    expect(out.root).toEqual([
      { name: 'notes', type: 'directory' },
      { name: 'a.txt', type: 'file' },
    ]);
    expect(out.bootsWhileAsleep).toBe(0);
    expect(out.heldBeforeBoot).toEqual(['a.txt', 'notes/plan.md']);
    expect(out.onDisk).toBe('alpha');
    expect(out.heldAfterBoot).toBe(0);
    expect(out.sealed).toBe(true);
  });
});
