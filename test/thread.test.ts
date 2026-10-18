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

const get = async (path: string) => {
  const response = await worker.fetch(`http://coil${path}?run=${crypto.randomUUID().slice(0, 8)}`);
  const body = await response.text();

  if (!response.ok) throw new Error(`${path} -> ${response.status}: ${body}`);

  return JSON.parse(body);
};

test('two threads get two computers: a file one agent writes is not in the other', {
  timeout: 60_000,
}, async () => {
  const out = await get('/isolation');

  expect(out.inA).toContain('secret.txt');
  expect(out.inB).not.toContain('secret.txt');
  expect(out.bRead).toMatch(/^refused/);
});

test('after its Durable Object restarts, a thread restores the last real page its browser had open', {
  timeout: 30_000,
}, async () => {
  const out = await get('/browser-url');

  expect(out.killed).toBe('aborted');
  expect(out.restored).toBe('http://localhost:3000/');
});

test('a thread killed with ctx.abort() mid-turn comes back and finishes the same request once', {
  timeout: 60_000,
}, async () => {
  const out = await get('/kill');

  expect(out.killed).toBe('aborted');
  expect(out.answer).toBe('Done.');
  expect(out.busy).toBe(false);
  expect(out.file).toBe('survived');
  expect(out.turns).toBe(1);
});

test('compact, pause, kill, resume: the summary and the disk come back together and the agent keeps working', {
  timeout: 90_000,
}, async () => {
  const out = await get('/compact');

  expect(out.pairReason).toBe('compaction');
  expect(out.summaryEntry).not.toBeNull();
  expect(out.pausedReason).toBe('pause');
  expect(out.phaseAfterPause).toBe('paused');
  expect(out.runningAfterPause).toBe(false);
  expect(out.resumedFiles.split('\n')).toEqual(['a.txt', 'b.txt']);
  expect(out.pairs).toEqual(['compaction', 'pause']);
  expect(out.hasSummary).toBe(true);
  expect(out.summaryIdMatches).toBe(true);
  expect(out.lastAnswer).toBe('Done.');
  expect(out.finalFiles.split('\n')).toEqual(['a.txt', 'b.txt', 'c.txt']);
});

test('a failed turn marks the thread failed in the list, and a good turn clears it', {
  timeout: 60_000,
}, async () => {
  const out = await get('/failed-mark');

  expect(out).toEqual({ afterFail: true, afterOk: false });
});

test('the directory lists threads from any creator, and a fork starts from the parent disk', {
  timeout: 60_000,
}, async () => {
  const out = await get('/directory-fork-child');

  expect(out.listed.map((t: { createdBy: string }) => t.createdBy).sort()).toEqual(['mcp', 'web']);
  expect(
    out.listed.find((t: { forkedFrom: string | null }) => t.forkedFrom !== null),
  ).toBeDefined();
  expect(out.forkSees).toBe('the plan');
  expect(out.forkSeeded).toBe(true);
  expect(out.unknown).toMatch(/unknown thread/);
});

test('lifecycle: pause waits for the turn, a lost computer is reported, and an idle thread pauses itself', {
  timeout: 90_000,
}, async () => {
  const out = await get('/lifecycle');

  expect(out.pauseDuringTurn).toMatch(/agent is working/);
  expect(out.compactDuringTurn).toMatch(/agent is working/);
  expect(out.compacted).toBe('compaction');
  expect(['pause', 'refused']).toContain(out.pausedDuringCompaction);
  expect(out.filesAfterCompaction.split('\n')).toContain('kept.txt');
  expect(['pause', 'refused']).toContain(out.racedPause);
  expect(out.racedTurnAnswered).toBe(true);
  expect(out.racedFile).toBe(true);
  expect(out.filesAfterCrash.split('\n')).toContain('kept.txt');
  expect(out.lostNoticed).toBe(true);
  expect(out.idlePhase).toBe('paused');
  expect(out.idleRunning).toBe(false);
  expect(out.idlePairs.at(-1)).toBe('pause');
});

test('each Access user sees and controls only their own threads', { timeout: 60_000 }, async () => {
  const out = await get('/owners');

  expect(out.anaSees.length).toBe(2);
  expect(out.boSees).toEqual([]);
  for (const key of ['boView', 'boRead', 'boExec', 'boPause', 'boFork'])
    expect(out[key]).toMatch(/unknown thread/);
  expect(out.boTakesName).toMatch(/is taken/);
  expect(out.anaOwner).toBe('ana@example.com');
  expect(out.forkOwner).toBe('ana@example.com');
});

test('container size is set at creation and can change later without losing the disk', {
  timeout: 60_000,
}, async () => {
  const out = await get('/size');

  expect(out.created).toBe('standard-2');
  expect(out.resized).toEqual({ size: 'standard-4', restarted: true });
  expect(out.afterResize).toBe('survives-resize');
  expect(out.same).toEqual({ size: 'standard-4', restarted: false });
  expect(out.pausedResize).toEqual({ size: 'lite', restarted: false });
  expect(out.boots).toEqual(['standard-2', 'standard-4', 'lite']);
  expect(out.finalSize).toBe('lite');
});

test('agent tools: edit_file changes one exact piece; notes survive in the ledger', {
  timeout: 60_000,
}, async () => {
  const out = await get('/tools');

  expect(out.edited).toBe('color=blue size=2');
  expect(out.notes).toBe('goal is a blue app');
  expect(out.toolNames).toEqual(['write_file', 'edit_file', 'notes_write']);
  expect(out.turns).toBe(3);
});

test('threads drive threads: list, read as data, send, create; another owner stays unknown', {
  timeout: 60_000,
}, async () => {
  const out = await get('/threads');

  expect(out.listed).toContain('tb-');
  expect(out.listed).not.toContain('tf-');
  expect(out.read).toContain('<thread-data');
  expect(out.read).toContain('hello from b');
  expect(out.sent).toContain('sent to tb-');
  expect(out.bFiles.split('\n')).toContain('c.txt');
  expect(out.foreignRead).toContain('unknown thread tf-');
  expect(out.created).toContain('created made-by-a-');
  expect(out.madeByA).toEqual(['Made by a']);
  expect(out.foreignListedForAna).toBe(false);
});

test('a loop runs three times, stops at its gate, writes a digest; the kill switch stops every loop', {
  timeout: 90_000,
}, async () => {
  const out = await get('/loop');

  expect(out.runs).toBe(3);
  expect(out.enabled).toBe(false);
  expect(out.stoppedBecause).toBe('gate passed after 3 runs');
  expect(out.gates).toEqual([1, 1, 0]);
  expect(out.files).toEqual(['step-1.txt', 'step-2.txt', 'step-3.txt']);
  expect(out.digest).toContain('3 runs');
  expect(out.killed).toEqual([expect.stringMatching(/^kill-/)]);
  expect(out.afterKill).toEqual({ enabled: false, stoppedBecause: 'kill switch' });
});

test('share links: owner-only, stable, read-only view, turned off by unshare', {
  timeout: 60_000,
}, async () => {
  const out = await get('/share');

  expect(out.path).toMatch(/^\/s\/[A-Za-z0-9_-]{20,}$/);
  expect(out.same).toBe(true);
  expect(out.messages).toBeGreaterThan(0);
  expect(out.foreignShare).toContain('unknown thread');
  expect(out.afterUnshare).toBe(true);
});

test('a stopped loop stays stopped even if a tick was in flight; loop turns cannot fan out tasks', {
  timeout: 60_000,
}, async () => {
  const out = await get('/loop-race');

  expect(out.blocked).toContain('cannot start other threads with a task');
  expect(out.racedEnabled).toBe(false);
  expect(out.afterEnabled).toBe(false);
  expect(out.runs).toBeLessThanOrEqual(1);
  expect(out.stoppedBecause).toBe('stopped by the owner');
  expect(out.digests).toBe(1);
});

test('looping threads cannot send work to other threads', { timeout: 60_000 }, async () => {
  const out = await get('/loop-send');

  expect(out.sent).toContain('cannot send work');
});

test('one spend limit, set by each person: none by default, blocks new turns once reached, per owner', {
  timeout: 60_000,
}, async () => {
  const out = await get('/limit');

  expect(out.noLimit).toEqual({ spent: 0, limit: null });
  expect(out.firstTurn).toBe('allowed');
  expect(out.set.limit).toBe(25);
  expect(out.overLimit).toMatch(/spend limit of \$25\.00 is reached/);
  expect(out.neighborSpend).toEqual({ spent: 0, limit: null });
  expect(out.raised.limit).toBe(100);
  expect(out.underRaised).toBe('allowed');
  expect(out.cleared.limit).toBeNull();
  expect(out.badLimit).toMatch(/positive dollar amount/);
});
