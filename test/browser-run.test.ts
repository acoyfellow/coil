import { describe, expect, it, vi } from 'vitest';
import { capabilityNamed, inputSchema } from '../src/capabilities';
import type { Coil } from '../src/service';

const shellApi = (overrides: Partial<Coil> = {}): Coil =>
  ({
    browserOpen: vi.fn(async () => ({ title: 'Example Domain', url: 'https://example.com/' })),
    browserNewTab: vi.fn(async () => ({ title: 'New', url: 'https://example.com/' })),
    browserSwitchTab: vi.fn(async () => ({ title: 'Back', url: 'https://example.com/' })),
    browserClick: vi.fn(async () => ({ clicked: 'e3', title: 'After click' })),
    browserType: vi.fn(async () => 5),
    browserEval: vi.fn(async (_name: string, expression: string) =>
      expression === 'document.body.innerText'
        ? 'Dashboard welcome back'
        : `result-of:${expression}`,
    ),
    browserScreenshot: vi.fn(async () => 'iVBORw0KGgo='),
    ...overrides,
  }) as unknown as Coil;

const runBrowserRun = (api: Coil, steps: string, expectText?: string) => {
  const capability = capabilityNamed('browser_run');

  if (!capability) throw new Error('browser_run missing');

  return capability.run(
    api,
    expectText === undefined
      ? { name: 'threads', steps }
      : { name: 'threads', steps, expect: expectText },
  ) as Promise<unknown>;
};

describe('browser_run', () => {
  it('is in the documented schema', () => {
    const capability = capabilityNamed('browser_run');

    expect(capability?.group).toBe('browser');
    expect(inputSchema(capability!).properties).toHaveProperty('name');
    expect(inputSchema(capability!).properties).toHaveProperty('steps');
  });

  it('runs a script of steps in order and returns per-step receipts', async () => {
    const api = shellApi();
    const output = (await runBrowserRun(
      api,
      JSON.stringify([
        { op: 'open', url: 'https://example.com/' },
        { op: 'screenshot' },
        { op: 'eval', expression: 'document.title' },
      ]),
      'result-of:document.title',
    )) as {
      steps: Array<{ index: number; op: string; ok: boolean; result: unknown; durationMs: number }>;
      expect: { text: string; found: boolean };
    };

    expect(output.steps).toHaveLength(3);
    expect(output.steps[0]).toMatchObject({ index: 0, op: 'open', ok: true });
    expect(output.steps[1]).toMatchObject({ op: 'screenshot', result: { bytes: 12 } });
    expect(output.steps[2]).toMatchObject({ op: 'eval', result: 'result-of:document.title' });
    expect(output.expect).toMatchObject({ text: 'result-of:document.title', found: true });
  });

  it('checks the expectation against the last step result and reports misses', async () => {
    const api = shellApi();
    const output = (await runBrowserRun(
      api,
      JSON.stringify([{ op: 'open', url: 'https://example.com/' }]),
      'Example Domain',
    )) as { expect: { text: string; found: boolean } };

    expect(output.expect).toMatchObject({ text: 'Example Domain', found: true });
  });

  it('waits for page text before continuing', async () => {
    let calls = 0;
    const api = shellApi({
      browserEval: vi.fn(async () => {
        calls += 1;
        return calls < 2 ? 'loading' : 'Dashboard welcome back';
      }),
    });
    const output = (await runBrowserRun(
      api,
      JSON.stringify([
        { op: 'open', url: 'https://example.com/' },
        { op: 'wait', text: 'Dashboard' },
      ]),
    )) as { steps: Array<{ op: string; ok: boolean }> };

    expect(output.steps[1]).toMatchObject({ op: 'wait', ok: true });
    expect(calls).toBeGreaterThan(1);
  });

  it('stops at the first failing step and reports where', async () => {
    const api = shellApi({
      browserClick: vi.fn(async () => {
        throw new Error('no element e9');
      }),
    });
    const output = (await runBrowserRun(
      api,
      JSON.stringify([
        { op: 'open', url: 'https://example.com/' },
        { op: 'click', ref: 'e9' },
        { op: 'eval', expression: 'document.title' },
      ]),
    )) as {
      steps: Array<{ index: number; op: string; ok: boolean }>;
      failedIndex: number;
      error: string;
    };

    expect(output.failedIndex).toBe(1);
    expect(output.error).toContain('no element e9');
    expect(output.steps).toHaveLength(2);
    expect(output.steps[0]).toMatchObject({ op: 'open', ok: true });
    expect(output.steps[1]).toMatchObject({ op: 'click', ok: false });
    expect(api.browserEval).not.toHaveBeenCalled();
  });

  it('supports new_tab and switch_tab', async () => {
    const api = shellApi();
    const output = (await runBrowserRun(
      api,
      JSON.stringify([
        { op: 'new_tab', url: 'https://example.com/' },
        { op: 'switch_tab', index: 0 },
      ]),
    )) as { steps: Array<{ op: string; ok: boolean }> };

    expect(output.steps.map((step) => step.op)).toEqual(['new_tab', 'switch_tab']);
    expect(output.steps.every((step) => step.ok)).toBe(true);
  });

  it('rejects unknown ops and malformed steps', async () => {
    const api = shellApi();

    await expect(runBrowserRun(api, 'not-json')).rejects.toThrowError('steps must be a JSON list');
    await expect(runBrowserRun(api, JSON.stringify([{ op: 'scroll' }]))).rejects.toThrowError(
      'unknown op',
    );
    await expect(runBrowserRun(api, JSON.stringify([{ url: 'x' }]))).rejects.toThrowError(
      'unknown op',
    );
    await expect(runBrowserRun(api, JSON.stringify([{ op: 'click' }]))).rejects.toThrowError(
      'ref is required',
    );
  });
});
