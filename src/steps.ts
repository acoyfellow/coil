export type Step = {
  readonly op:
    | 'open'
    | 'new_tab'
    | 'switch_tab'
    | 'click'
    | 'type'
    | 'eval'
    | 'wait'
    | 'wait_ms'
    | 'screenshot';
  readonly url?: string;
  readonly ref?: string;
  readonly index?: number;
  readonly text?: string;
  readonly expression?: string;
  readonly ms?: number;
};

export const OPS: readonly Step['op'][] = [
  'open',
  'new_tab',
  'switch_tab',
  'click',
  'type',
  'eval',
  'wait',
  'wait_ms',
  'screenshot',
];

export class StepError extends Error {}

export type StepExecutor = {
  readonly open: (url: string) => Promise<unknown>;
  readonly newTab: (url: string) => Promise<unknown>;
  readonly switchTab: (index: number) => Promise<unknown>;
  readonly click: (ref: string) => Promise<unknown>;
  readonly type: (text: string, ref?: string) => Promise<unknown>;
  readonly evaluate: (expression: string) => Promise<unknown>;
  readonly screenshot: () => Promise<unknown>;
  readonly pageText: () => Promise<string>;
};

export type StepReceipt = {
  readonly index: number;
  readonly op: string;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly result?: unknown;
  readonly error?: string;
};

export type StepsReceipt = {
  readonly steps: StepReceipt[];
  readonly failedIndex?: number;
  readonly error?: string;
  readonly expect?: { readonly text: string; readonly found: boolean };
};

const field = (step: Readonly<Record<string, unknown>>, name: string): string => {
  const value = step[name];

  if (typeof value !== 'string' || value === '') throw new StepError(`${name} is required`);

  return value;
};

const numeric = (
  step: Readonly<Record<string, unknown>>,
  name: string,
  fallback: number,
): number => {
  const value = step[name] ?? fallback;

  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new StepError(`${name} must be a number`);

  return value;
};

export const parseStep = (step: unknown): Step => {
  if (typeof step !== 'object' || step === null)
    throw new StepError('steps must be a list of objects');

  const record = step as Readonly<Record<string, unknown>>;
  const op = record.op as Step['op'] | undefined;

  if (op === undefined || !OPS.includes(op))
    throw new StepError(`unknown op: ${typeof record.op === 'string' ? record.op : 'unknown'}`);

  switch (op) {
    case 'open':
    case 'new_tab':
      return { op, url: field(record, 'url') };
    case 'switch_tab':
      return { op, index: numeric(record, 'index', 0) };
    case 'click':
      return { op, ref: field(record, 'ref') };
    case 'type': {
      const text = field(record, 'text');
      const ref = record.ref === undefined ? undefined : field(record, 'ref');

      return ref === undefined ? { op, text } : { op, text, ref };
    }
    case 'eval':
      return { op, expression: field(record, 'expression') };
    case 'wait':
      return { op, text: field(record, 'text') };
    case 'wait_ms':
      return { op, ms: numeric(record, 'ms', 0) };
    case 'screenshot':
      return { op };
  }
};

export const parseSteps = (raw: string): Step[] => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StepError('steps must be a JSON list of step objects');
  }

  if (!Array.isArray(parsed)) throw new StepError('steps must be a JSON list of step objects');

  return parsed.map(parseStep);
};

const runOne = async (executor: StepExecutor, step: Step): Promise<unknown> => {
  switch (step.op) {
    case 'open':
      return executor.open(step.url as string);
    case 'new_tab':
      return executor.newTab(step.url as string);
    case 'switch_tab':
      return executor.switchTab(step.index as number);
    case 'click':
      return executor.click(step.ref as string);
    case 'type':
      return executor.type(step.text as string, step.ref);
    case 'eval':
      return executor.evaluate(step.expression as string);
    case 'wait': {
      const wanted = step.text as string;

      for (let attempt = 0; attempt < 20; attempt++) {
        const body = await executor.pageText();

        if (body.includes(wanted)) return body;

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      throw new StepError(`timed out waiting for: ${wanted}`);
    }
    case 'wait_ms': {
      const ms = step.ms as number;

      await new Promise((resolve) => setTimeout(resolve, ms));

      return ms;
    }
    case 'screenshot': {
      const png = await executor.screenshot();
      const bytes = typeof png === 'string' ? png.length : JSON.stringify(png).length;

      return { bytes };
    }
  }
};

export const runSteps = async (
  executor: StepExecutor,
  steps: readonly Step[],
  expectText?: string,
): Promise<StepsReceipt> => {
  const done: StepReceipt[] = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index] as Step;
    const started = Date.now();

    try {
      const result = await runOne(executor, step);

      done.push({ index, op: step.op, ok: true, durationMs: Date.now() - started, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      done.push({
        index,
        op: step.op,
        ok: false,
        durationMs: Date.now() - started,
        error: message,
      });

      return { steps: done, failedIndex: index, error: message };
    }
  }

  if (expectText === undefined) return { steps: done };

  const last = done[done.length - 1];
  const lastText = last?.result === undefined ? '' : JSON.stringify(last.result);

  return { steps: done, expect: { text: expectText, found: lastText.includes(expectText) } };
};
