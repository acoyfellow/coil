import { describe, expect, it } from 'vitest';
import { decide, digest, type LoopState, validSpec } from '../src/loop';

const loop = (over: Partial<LoopState> = {}): LoopState => ({
  prompt: 'do the next step',
  everySeconds: 60,
  maxRuns: 3,
  gate: null,
  enabled: true,
  runs: [],
  nextAt: 0,
  stoppedBecause: null,
  ...over,
});

const run = (gateExit: number | null = null) => ({ at: 0, gateExit });

describe('loop decisions', () => {
  it('rejects unsafe specs', () => {
    expect(validSpec({ prompt: '', everySeconds: 60, maxRuns: 3, gate: null })).toContain('prompt');
    expect(validSpec({ prompt: 'x', everySeconds: 5, maxRuns: 3, gate: null })).toContain('30');
    expect(validSpec({ prompt: 'x', everySeconds: 60, maxRuns: 0, gate: null })).toContain(
      'max runs',
    );
  });

  it('runs when due, waits for the interval and for a busy agent', () => {
    expect(decide(loop(), 1000, false)).toEqual({ kind: 'run' });
    expect(decide(loop({ nextAt: 5000 }), 1000, false)).toEqual({
      kind: 'wait',
      at: 5000,
    });
    expect(decide(loop(), 1000, true).kind).toBe('wait');
  });

  it('stops at the run cap', () => {
    expect(decide(loop({ runs: [run(), run(), run()] }), 1000, false)).toEqual({
      kind: 'stop',
      reason: 'ran 3 times',
    });
  });

  it('checks the gate once after each run', () => {
    const gated = loop({ gate: 'test -f done', runs: [run()] });

    expect(decide(gated, 1000, false)).toEqual({ kind: 'check-gate' });
    expect(decide(loop({ gate: 'test -f done', runs: [run(1)] }), 1000, false)).toEqual({
      kind: 'run',
    });
  });

  it('a stopped loop stays stopped (kill switch)', () => {
    expect(decide(loop({ enabled: false, stoppedBecause: 'kill switch' }), 1000, false)).toEqual({
      kind: 'stop',
      reason: 'kill switch',
    });
  });

  it('writes an end-of-run digest', () => {
    const text = digest(
      loop({
        gate: 'test -f done',
        runs: [run(1), run(0)],
        stoppedBecause: 'gate passed after 2 runs',
      }),
    );

    expect(text).toContain('2 runs');
    expect(text).not.toContain('$');
    expect(text).toContain('gate passed after 2 runs');
    expect(text).toContain('exits by run: 1 0');
  });
});
