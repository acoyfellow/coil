import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import { CAPABILITIES } from '../src/capabilities';

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

test('agents can manage folders through capabilities', () => {
  const names = CAPABILITIES.map((capability) => capability.name);

  for (const name of [
    'folder_list',
    'folder_create',
    'folder_rename',
    'folder_delete',
    'thread_move',
  ])
    expect(names).toContain(name);
});

test('folders: create, rename, order, file a thread, move by name, delete keeps threads', {
  timeout: 60_000,
}, async () => {
  const response = await worker.fetch(`http://coil/folders?run=${crypto.randomUUID().slice(0, 8)}`);
  const out = (await response.json()) as Record<string, unknown>;

  expect(out.firstName).toBe('Coil work');
  expect(out.renamed).toBe('Coil');
  expect(out.filedFolder).toBe(out.coilId);
  expect(out.agentFolderName).toBe('personal');
  expect(out.reusedSame).toBe(true);
  expect(out.movedOrder).toBe(0);
  expect(out.order).toEqual(['Customer0', 'Coil', 'personal']);
  expect(out.badFolder).toBe('unknown folder f-nope');
  expect(out.emptyName).toBe('A folder needs a name.');
  expect(out.threadStillThere).toBe(true);
  expect(out.afterDeleteFolder).toBeNull();
  expect(out.unfiled).toBeNull();
});
