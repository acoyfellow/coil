import { describe, expect, it, vi } from 'vitest';
import { capabilityNamed } from '../src/capabilities';
import type { Coil } from '../src/service';

const shellApi = (overrides: Partial<Coil> = {}): Coil =>
  ({
    browserOpen: vi.fn(async (_name: string, url: string) => ({
      title: url === 'https://example.com/' ? 'Example Domain' : 'Other',
      url,
    })),
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
    goalList: vi.fn(async () => [{ goal: 'open-example', steps: 2 }]),
    goalClear: vi.fn(async () => ({ cleared: true })),
    sheetSave: vi.fn(async (_name: string, sheet: string, goal: string, expect: string) => ({
      sheet,
      goal,
      expect,
    })),
    sheetList: vi.fn(async () => [
      { sheet: 'example-sheet', goal: 'open-example', expect: 'result-of:document.title' },
    ]),
    sheetRun: vi.fn(
      async (_name: string, _sheet: string) =>
        ({
          steps: [
            { op: 'open', url: 'https://example.com/' },
            { op: 'eval', expression: 'document.title' },
          ],
          expect: 'result-of:document.title',
        }) as never,
    ),
    ...overrides,
  }) as unknown as Coil;

const runCap = (name: string, api: Coil, args: Record<string, unknown>) => {
  const capability = capabilityNamed(name);

  if (!capability) throw new Error(`${name} missing`);

  return capability.run(api, args) as Promise<unknown>;
};

describe('expectation sheets', () => {
  it('is present in the capability list', () => {
    expect(capabilityNamed('sheet_save')?.group).toBe('browser');
    expect(capabilityNamed('sheet_run')?.group).toBe('browser');
    expect(capabilityNamed('sheet_list')?.group).toBe('browser');
  });

  it('saves a sheet over a goal and lists it', async () => {
    const api = shellApi();
    const saved = (await runCap('sheet_save', api, {
      name: 'threads',
      sheet: 'example-sheet',
      goal: 'open-example',
      expect: 'result-of:document.title',
    })) as { sheet: string; goal: string; expect: string };

    expect(saved).toEqual({
      sheet: 'example-sheet',
      goal: 'open-example',
      expect: 'result-of:document.title',
    });

    const listed = (await runCap('sheet_list', api, { name: 'threads' })) as Array<{
      sheet: string;
      goal: string;
      expect: string;
    }>;

    expect(listed).toEqual([
      { sheet: 'example-sheet', goal: 'open-example', expect: 'result-of:document.title' },
    ]);
  });

  it('runs a sheet, checks the expectation, and reports pass with the receipt', async () => {
    const api = shellApi();
    const output = (await runCap('sheet_run', api, {
      name: 'threads',
      sheet: 'example-sheet',
    })) as {
      sheet: string;
      pass: boolean;
      receipt: { steps: Array<{ op: string; ok: boolean }>; expect: { found: boolean } };
    };

    expect(output.sheet).toBe('example-sheet');
    expect(output.pass).toBe(true);
    expect(output.receipt.steps.every((step) => step.ok)).toBe(true);
    expect(output.receipt.expect.found).toBe(true);
  });

  it('fails the capability when the expectation does not hold', async () => {
    const api = shellApi({
      sheetRun: vi.fn(
        async (_name: string, _sheet: string) =>
          ({
            steps: [{ op: 'open', url: 'https://example.com/' }],
            expect: 'Missing Text',
          }) as never,
      ),
    });

    await expect(
      runCap('sheet_run', api, { name: 'threads', sheet: 'example-sheet' }),
    ).rejects.toThrowError('did not reproduce');
  });
});
