export type LoopSpec = {
  readonly prompt: string;
  readonly everySeconds: number;
  readonly maxRuns: number;
  readonly gate: string | null;
};

export type LoopRun = {
  readonly at: number;
  readonly gateExit: number | null;
};

export type LoopState = LoopSpec & {
  readonly enabled: boolean;
  readonly runs: readonly LoopRun[];
  readonly nextAt: number;
  readonly stoppedBecause: string | null;
  readonly loopId?: string;
};

export const MIN_EVERY_SECONDS = 30;

export const validSpec = (spec: LoopSpec): string | null => {
  if (spec.prompt.trim() === '') return 'prompt is required';
  if (!(spec.everySeconds >= MIN_EVERY_SECONDS))
    return `every must be at least ${MIN_EVERY_SECONDS} seconds`;
  if (!(Number.isInteger(spec.maxRuns) && spec.maxRuns >= 1)) return 'max runs must be 1 or more';

  return null;
};

export type LoopDecision =
  | { readonly kind: 'wait'; readonly at: number }
  | { readonly kind: 'check-gate' }
  | { readonly kind: 'run' }
  | { readonly kind: 'stop'; readonly reason: string };

export const decide = (loop: LoopState, now: number, busy: boolean): LoopDecision => {
  if (!loop.enabled) return { kind: 'stop', reason: loop.stoppedBecause ?? 'stopped' };
  if (busy) return { kind: 'wait', at: now + 5_000 };
  if (now < loop.nextAt) return { kind: 'wait', at: loop.nextAt };
  if (loop.gate !== null && loop.runs.length > 0 && loop.runs.at(-1)?.gateExit === null)
    return { kind: 'check-gate' };
  if (loop.runs.length >= loop.maxRuns)
    return { kind: 'stop', reason: `ran ${loop.maxRuns} times` };

  return { kind: 'run' };
};

export const digest = (loop: LoopState): string => {
  const gates = loop.runs
    .map((run) => (run.gateExit === null ? '-' : String(run.gateExit)))
    .join(' ');

  return [
    `Loop digest: ${loop.runs.length} run${loop.runs.length === 1 ? '' : 's'}.`,
    `Stopped: ${loop.stoppedBecause ?? 'still running'}.`,
    loop.gate === null ? 'No gate.' : `Gate \`${loop.gate}\` exits by run: ${gates}.`,
  ].join('\n');
};
