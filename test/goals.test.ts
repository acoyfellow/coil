import { describe, expect, it, vi } from 'vitest';
import { capabilityNamed } from '../src/capabilities';
import type { Coil } from '../src/service';

const shellApi = (overrides: Partial<Coil> = {}): Coil =>
  ({
    browserOpen: vi.fn(async () => ({ title: 'Example Domain', url: 'https://example.com/' })),
    browserEval: vi.fn(async (_name: string, expression: string) =>
      expression === 'document.body.innerText'
        ? 'Dashboard welcome back'
        : `result-of:${expression}`,
    ),
    recordStep: vi.fn(async () => undefined),
    goalSave: vi.fn(async (_name: string, goal: string, steps: string) => {
      const list = JSON.parse(steps) as unknown[];
      return { goal, steps: list.length, source: 'script' } as const;
    }),
    goalRun: vi.fn(async () => [
      { op: 'open', url: 'https://example.com/' },
      { op: 'eval', expression: 'document.title' },
    ]),
    goalList: vi.fn(async () => [{ goal: 'login-dash', steps: 2 }]),
    goalClear: vi.fn(async (_name: string, goal: string) => ({
      cleared: goal === '' || goal === 'login-dash',
    })),
    ...overrides,
  }) as unknown as Coil;

const runCap = (name: string, api: Coil, args: Record<string, unknown>) => {
  const capability = capabilityNamed(name);

  if (!capability) throw new Error(`${name} missing`);

  return capability.run(api, args) as Promise<unknown>;
};

describe('goals', () => {
  it('is present in the capability list', () => {
    expect(capabilityNamed('goal_save')?.group).toBe('browser');
    expect(capabilityNamed('goal_run')?.group).toBe('browser');
    expect(capabilityNamed('goal_list')?.group).toBe('browser');
    expect(capabilityNamed('goal_clear')?.group).toBe('browser');
  });

  it('saves a goal on a successful browser_run and replays it with goal_run', async () => {
    const api = shellApi();
    const saved = (await runCap('browser_run', api, {
      name: 'threads',
      steps: JSON.stringify([{ op: 'open', url: 'https://example.com/' }]),
      saveAs: 'login-dash',
    })) as { savedGoal: string };

    expect(saved.savedGoal).toBe('login-dash');
    expect(api.goalSave).toHaveBeenCalled();

    const replayed = (await runCap('goal_run', api, {
      name: 'threads',
      goal: 'login-dash',
      expect: 'result-of:document.title',
    })) as {
      goal: string;
      steps: Array<{ op: string; ok: boolean }>;
      expect: { found: boolean };
    };

    expect(replayed.goal).toBe('login-dash');
    expect(replayed.steps.every((step) => step.ok)).toBe(true);
    expect(replayed.expect.found).toBe(true);
  });

  it('records individual interactions so goal_save can freeze them once', async () => {
    const captured: string[] = [];
    const api = shellApi({
      recordStep: vi.fn(async (_name: string, step: string) => {
        captured.push(step);
      }),
    });

    await runCap('browser_open', api, { name: 'threads', url: 'https://example.com/' });
    await runCap('browser_eval', api, { name: 'threads', expression: 'document.title' });

    expect(captured).toHaveLength(2);
    expect(captured[0]).toContain('"open"');
    expect(captured[1]).toContain('"eval"');
  });

  it('lists and clears goals', async () => {
    const api = shellApi();
    const listed = (await runCap('goal_list', api, { name: 'threads' })) as Array<{
      goal: string;
      steps: number;
    }>;

    expect(listed).toEqual([{ goal: 'login-dash', steps: 2 }]);

    const cleared = (await runCap('goal_clear', api, { name: 'threads', goal: 'login-dash' })) as {
      cleared: boolean;
    };

    expect(cleared.cleared).toBe(true);
  });
});
