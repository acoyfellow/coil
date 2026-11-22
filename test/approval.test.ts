import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import { approvalKey, riskOf, riskOfCommand } from '../src/approval';

describe('which calls need a person', () => {
  test.each([
    ['git push origin main', 'push'],
    ['cd repo && git push', 'push'],
    ['git -C /workspace push --force', 'push'],
    ['/usr/bin/git push', 'push'],
    ['GIT_SSH_COMMAND=ssh git push', 'push'],
    ['bash -lc "git push origin HEAD"', 'push'],
    ["sh -c 'npm test; git push'", 'push'],
    ['gh pr merge 12 --squash', 'push'],
    ['npx wrangler deploy', 'deploy'],
    ['wrangler versions deploy', 'deploy'],
    ['npm publish --access public', 'deploy'],
    ['bun run deploy', 'deploy'],
  ])('%s needs approval for %s', (command, risk) => {
    expect(riskOfCommand(command)).toBe(risk);
  });

  test.each([
    'git status',
    'git log --grep push',
    'echo "git push"',
    'grep -r "wrangler deploy" docs',
    'npm test',
    'git commit -m "push the button"',
    'cat deploy.md',
  ])('%s runs without asking', (command) => {
    expect(riskOfCommand(command)).toBeNull();
  });

  test('only the run and job tools carry shell commands', () => {
    expect(riskOf('run', { command: 'git push' })).toBe('push');
    expect(riskOf('job_start', { name: 'x', command: 'wrangler deploy' })).toBe('deploy');
    expect(riskOf('write_file', { path: 'x.sh', content: 'git push' })).toBeNull();
    expect(riskOf('thread_delete', { name: 'x' })).toBe('delete');
  });
});

describe('an approval binds to one call', () => {
  test('the key changes with the arguments and the call', async () => {
    const one = await approvalKey('c1', 'run', { command: 'git push' });

    expect(await approvalKey('c1', 'run', { command: 'git push' })).toBe(one);
    expect(await approvalKey('c1', 'run', { command: 'git push --force' })).not.toBe(one);
    expect(await approvalKey('c2', 'run', { command: 'git push' })).not.toBe(one);
  });

  test('key order in the arguments does not matter', async () => {
    expect(await approvalKey('c', 'job_start', { name: 'a', command: 'b' })).toBe(
      await approvalKey('c', 'job_start', { command: 'b', name: 'a' }),
    );
  });
});

type Probe = {
  readonly parked: { tool: string; risk: string; args: string }[];
  readonly ranBefore: boolean;
  readonly allowed: { left: number; ran: boolean; answer: string };
  readonly denied: { ran: boolean; answer: string };
  readonly unknown: string;
  readonly safe: { parked: number; ran: boolean };
  readonly listedWaiting: number;
  readonly listedAfter: number;
};

describe('the gate in a thread', () => {
  let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

  beforeAll(async () => {
    worker = await unstable_startWorker({
      config: resolve(__dirname, 'worker/wrangler.jsonc'),
      dev: { server: { port: 0 }, inspector: false },
    });
  }, 120_000);

  afterAll(async () => {
    await worker?.dispose();
  });

  test('a push waits, runs once approved, and a denied push never runs', async () => {
    const response = await worker.fetch('http://test/approval');
    const probe = (await response.json()) as Probe;

    expect(probe.parked).toEqual([
      expect.objectContaining({
        tool: 'run',
        risk: 'push',
        args: '{"command":"git push origin main"}',
      }),
    ]);
    expect(probe.ranBefore).toBe(false);
    expect(probe.allowed.left).toBe(0);
    expect(probe.allowed.ran).toBe(true);
    expect(probe.denied.ran).toBe(false);
    expect(probe.denied.answer).toContain('The person said no');
    expect(probe.unknown).toContain('No open question has this key');
    expect(probe.safe).toEqual({ parked: 0, ran: true });
    expect(probe.listedWaiting).toBe(1);
    expect(probe.listedAfter).toBe(0);
  }, 120_000);
});
