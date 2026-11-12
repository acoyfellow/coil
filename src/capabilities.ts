import type { Coil } from './service';
import { isSize, SIZES } from './size';

export type Field = {
  readonly type: 'string' | 'number' | 'array';
  readonly description: string;
  readonly enum?: readonly string[];
  readonly items?: { readonly type: 'string' };
};

export type Capability = {
  readonly name: string;
  readonly group: 'threads' | 'shell' | 'files' | 'browser' | 'computer' | 'extensions' | 'bases';
  readonly summary: string;
  readonly input: Readonly<Record<string, Field>>;
  readonly required: readonly string[];
  readonly returns: string;
  readonly run: (api: Coil, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
};

export class CapabilityInputError extends Error {}

const text = (args: Readonly<Record<string, unknown>>, field: string): string => {
  const value = args[field];

  if (typeof value !== 'string' || value === '')
    throw new CapabilityInputError(`${field} is required`);

  return value;
};

const optional = (args: Readonly<Record<string, unknown>>, field: string): string | undefined => {
  const value = args[field];

  return typeof value === 'string' && value !== '' ? value : undefined;
};

const list = (args: Readonly<Record<string, unknown>>, field: string): string[] => {
  const value = args[field];

  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string'))
    throw new CapabilityInputError(`${field} must be a list of strings`);

  return value;
};

const count = (
  args: Readonly<Record<string, unknown>>,
  field: string,
  fallback: number,
): number => {
  const value = args[field] ?? fallback;

  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new CapabilityInputError(`${field} must be a number`);

  return value;
};

const NAME: Field = { type: 'string', description: 'Thread name, for example "fix-login-3a9c2e"' };

type BrowserRunStep = {
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

const BROWSER_RUN_OPS: readonly BrowserRunStep['op'][] = [
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

const stepText = (step: Readonly<Record<string, unknown>>, field: string): string => {
  const value = step[field];

  if (typeof value !== 'string' || value === '')
    throw new CapabilityInputError(`${field} is required`);

  return value;
};

const stepCount = (
  step: Readonly<Record<string, unknown>>,
  field: string,
  fallback: number,
): number => {
  const value = step[field] ?? fallback;

  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new CapabilityInputError(`${field} must be a number`);

  return value;
};

const parseStep = (step: unknown): BrowserRunStep => {
  if (typeof step !== 'object' || step === null)
    throw new CapabilityInputError('steps must be a list of objects');

  const record = step as Readonly<Record<string, unknown>>;
  const op = record.op as string as BrowserRunStep['op'] | undefined;

  if (op === undefined || !BROWSER_RUN_OPS.includes(op))
    throw new CapabilityInputError(
      `unknown op: ${typeof record.op === 'string' ? record.op : 'unknown'}`,
    );

  switch (op) {
    case 'open':
    case 'new_tab':
      return { op, url: stepText(record, 'url') };
    case 'switch_tab':
      return { op, index: stepCount(record, 'index', 0) };
    case 'click':
      return { op, ref: stepText(record, 'ref') };
    case 'type': {
      const text = stepText(record, 'text');
      const ref = record.ref === undefined ? undefined : stepText(record, 'ref');
      return ref ? { op, text, ref } : { op, text };
    }
    case 'eval':
      return { op, expression: stepText(record, 'expression') };
    case 'wait':
      return { op, text: stepText(record, 'text') };
    case 'wait_ms':
      return { op, ms: stepCount(record, 'ms', 0) };
    case 'screenshot':
      return { op };
  }
};

const parseSteps = (raw: string): BrowserRunStep[] => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CapabilityInputError('steps must be a JSON list of step objects');
  }

  if (!Array.isArray(parsed))
    throw new CapabilityInputError('steps must be a JSON list of step objects');

  return parsed.map(parseStep);
};

const runStep = async (
  api: import('./service').Coil,
  name: string,
  step: BrowserRunStep,
): Promise<unknown> => {
  switch (step.op) {
    case 'open':
      return api.browserOpen(name, step.url as string);
    case 'new_tab':
      return api.browserNewTab(name, step.url as string);
    case 'switch_tab':
      return api.browserSwitchTab(name, step.index as number);
    case 'click':
      return api.browserClick(name, step.ref as string);
    case 'type':
      return api.browserType(name, step.text as string, step.ref);
    case 'eval':
      return api.browserEval(name, step.expression as string);
    case 'wait':
      return api.browserEval(name, `document.body.innerText`);
    case 'wait_ms':
      return new Promise((resolve) =>
        setTimeout(() => resolve(step.ms as number), step.ms as number),
      );
    case 'screenshot': {
      const png = (await api.browserScreenshot(name)) as unknown;
      const length = typeof png === 'string' ? png.length : JSON.stringify(png).length;
      return { bytes: length };
    }
  }
};

const runWait = async (
  api: import('./service').Coil,
  name: string,
  textValue: string,
): Promise<string> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const body = await api.browserEval(name, `document.body.innerText`);
    const content = typeof body === 'string' ? body : JSON.stringify(body);
    if (content.includes(textValue)) return content;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new CapabilityInputError(`timed out waiting for: ${textValue}`);
};

const runBrowserSteps = async (
  api: import('./service').Coil,
  name: string,
  stepsRaw: string,
  expectText: string | undefined,
) => {
  const steps = parseSteps(stepsRaw);
  const executed: Array<{
    index: number;
    op: string;
    ok: boolean;
    durationMs: number;
    result?: unknown;
    error?: string;
  }> = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index] as BrowserRunStep;
    const started = performance.now();

    try {
      const result =
        step.op === 'wait'
          ? await runWait(api, name, step.text as string)
          : await runStep(api, name, step);
      executed.push({
        index,
        op: step.op,
        ok: true,
        durationMs: Math.round(performance.now() - started),
        result,
      });
    } catch (error) {
      executed.push({
        index,
        op: step.op,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        steps: executed,
        failedIndex: index,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const output: Record<string, unknown> = { steps: executed };

  if (expectText !== undefined) {
    const last = executed[executed.length - 1];
    const lastText = last && last.result !== undefined ? JSON.stringify(last.result) : '';
    output.expect = { text: expectText, found: lastText.includes(expectText) };
  }

  return output;
};

const SIZE: Field = { type: 'string', enum: SIZES, description: 'Container size' };

const sizeOf = (args: Readonly<Record<string, unknown>>) => {
  const value = args.size;

  return isSize(value) ? value : undefined;
};

export const CAPABILITIES: readonly Capability[] = [
  {
    name: 'thread_list',
    group: 'threads',
    summary: 'List your threads, newest activity first.',
    input: {},
    required: [],
    returns: 'Array of { name, title, phase, busy, repo, updatedAt }',
    run: (api) => api.list(),
  },
  {
    name: 'thread_create',
    group: 'threads',
    summary:
      'Create a thread: its own agent and its own Linux computer. repo is an optional git URL.',
    input: {
      name: { type: 'string', description: 'Optional thread name; one is made up if empty' },
      repo: { type: 'string', description: 'Optional git URL to clone into /workspace' },
      title: { type: 'string', description: 'Optional title shown in the sidebar' },
      size: SIZE,
    },
    required: [],
    returns: 'The thread view: { name, title, phase, messages, surfaces, ... }',
    run: (api, args) =>
      api.create({
        name: optional(args, 'name'),
        repo: optional(args, 'repo') ?? null,
        title: optional(args, 'title'),
        createdBy: 'mcp',
        size: sizeOf(args),
      }),
  },
  {
    name: 'thread_send',
    group: 'threads',
    summary:
      'Send a message to the thread agent and wait for the turn to finish. Reuse requestId to retry safely.',
    input: {
      name: NAME,
      text: { type: 'string', description: 'The message' },
      requestId: { type: 'string', description: 'Optional idempotency key' },
    },
    required: ['name', 'text'],
    returns: '{ status, answer }',
    run: (api, args) =>
      api.send(
        text(args, 'name'),
        optional(args, 'requestId') ?? crypto.randomUUID(),
        text(args, 'text'),
      ),
  },
  {
    name: 'thread_status',
    group: 'threads',
    summary: 'Phase, transcript, compaction pairs, turns, and recent commands of a thread.',
    input: { name: NAME },
    required: ['name'],
    returns: 'The thread view',
    run: (api, args) => api.view(text(args, 'name')),
  },
  {
    name: 'thread_fork',
    group: 'threads',
    summary: "Start a new thread from this thread's disk and a summary of its conversation.",
    input: { name: NAME, forkName: { type: 'string', description: 'Optional name for the fork' } },
    required: ['name'],
    returns: 'The new thread view',
    run: (api, args) => api.fork(text(args, 'name'), optional(args, 'forkName'), 'mcp'),
  },
  {
    name: 'thread_exec',
    group: 'shell',
    summary: 'Run a shell command in the thread computer, in /workspace.',
    input: { name: NAME, command: { type: 'string', description: 'Run with bash -lc' } },
    required: ['name', 'command'],
    returns: '{ exitCode, stdout, stderr, seq }',
    run: (api, args) => api.exec(text(args, 'name'), ['bash', '-lc', text(args, 'command')]),
  },
  {
    name: 'thread_read_file',
    group: 'files',
    summary: 'Read a file from the thread computer.',
    input: { name: NAME, path: { type: 'string', description: 'Relative to /workspace' } },
    required: ['name', 'path'],
    returns: 'The file contents as text',
    run: (api, args) => api.read(text(args, 'name'), text(args, 'path')),
  },
  {
    name: 'thread_write_file',
    group: 'files',
    summary:
      'Write a text file into /workspace on the thread computer, for example to upload a local pi extension folder file by file.',
    input: {
      name: NAME,
      path: { type: 'string', description: 'Relative to /workspace; must stay inside it' },
      content: { type: 'string', description: 'The full text of the file' },
    },
    required: ['name', 'path', 'content'],
    returns: '{ path, bytes }',
    run: (api, args) => api.write(text(args, 'name'), text(args, 'path'), text(args, 'content')),
  },
  {
    name: 'browser_open',
    group: 'browser',
    summary: "Load a URL in the thread's browser. localhost is the thread computer.",
    input: { name: NAME, url: { type: 'string', description: 'For example localhost:3000' } },
    required: ['name', 'url'],
    returns: 'Page title and URL',
    run: async (api, args) => {
      const result = await api.browserOpen(text(args, 'name'), text(args, 'url'));

      await api.recordStep(
        text(args, 'name'),
        JSON.stringify({ op: 'open', url: text(args, 'url') }),
      );

      return result;
    },
  },
  {
    name: 'browser_snapshot',
    group: 'browser',
    summary: 'List clickable elements as refs (e1, e2, ...) plus the page text.',
    input: { name: NAME },
    required: ['name'],
    returns: 'Text with one line per element: ref, role, label',
    run: (api, args) => api.browserSnapshot(text(args, 'name')),
  },
  {
    name: 'browser_click',
    group: 'browser',
    summary: 'Click an element by its ref from browser_snapshot.',
    input: { name: NAME, ref: { type: 'string', description: 'For example e3' } },
    required: ['name', 'ref'],
    returns: 'What was clicked and the page now open',
    run: async (api, args) => {
      const result = await api.browserClick(text(args, 'name'), text(args, 'ref'));

      await api.recordStep(
        text(args, 'name'),
        JSON.stringify({ op: 'click', ref: text(args, 'ref') }),
      );

      return result;
    },
  },
  {
    name: 'browser_type',
    group: 'browser',
    summary: 'Type text, optionally into an element ref first.',
    input: {
      name: NAME,
      text: { type: 'string', description: 'Text to type' },
      ref: { type: 'string', description: 'Optional element to click first' },
    },
    required: ['name', 'text'],
    returns: 'How many characters were typed',
    run: async (api, args) => {
      const result = await api.browserType(
        text(args, 'name'),
        text(args, 'text'),
        optional(args, 'ref'),
      );

      await api.recordStep(
        text(args, 'name'),
        JSON.stringify(
          optional(args, 'ref') === undefined
            ? { op: 'type', text: text(args, 'text') }
            : { op: 'type', text: text(args, 'text'), ref: optional(args, 'ref') as string },
        ),
      );

      return result;
    },
  },
  {
    name: 'browser_eval',
    group: 'browser',
    summary: 'Run a JavaScript expression in the page and return the result.',
    input: {
      name: NAME,
      expression: { type: 'string', description: 'For example document.title' },
    },
    required: ['name', 'expression'],
    returns: 'The result as text',
    run: async (api, args) => {
      const result = await api.browserEval(text(args, 'name'), text(args, 'expression'));

      await api.recordStep(
        text(args, 'name'),
        JSON.stringify({ op: 'eval', expression: text(args, 'expression') }),
      );

      return result;
    },
  },
  {
    name: 'browser_screenshot',
    group: 'browser',
    summary: 'Take a screenshot of the browser and return it as base64 PNG text.',
    input: { name: NAME },
    required: ['name'],
    returns: 'Base64 PNG of the visible page, 1280x800',
    run: async (api, args) => {
      const result = await api.browserScreenshot(text(args, 'name'));

      await api.recordStep(text(args, 'name'), JSON.stringify({ op: 'screenshot' }));

      return result;
    },
  },
  {
    name: 'browser_new_tab',
    group: 'browser',
    summary: 'Open a new tab in the browser and switch to it.',
    input: { name: NAME, url: { type: 'string', description: 'For example https://example.com' } },
    required: ['name', 'url'],
    returns: 'Page title and URL of the new tab',
    run: async (api, args) => {
      const result = await api.browserNewTab(text(args, 'name'), text(args, 'url'));

      await api.recordStep(
        text(args, 'name'),
        JSON.stringify({ op: 'new_tab', url: text(args, 'url') }),
      );

      return result;
    },
  },
  {
    name: 'browser_switch_tab',
    group: 'browser',
    summary: 'Switch to a browser tab by index.',
    input: { name: NAME, index: { type: 'number', description: 'Zero-based tab index' } },
    required: ['name', 'index'],
    returns: 'Page title and URL of the tab now shown',
    run: async (api, args) => {
      const result = await api.browserSwitchTab(text(args, 'name'), count(args, 'index', 0));

      await api.recordStep(
        text(args, 'name'),
        JSON.stringify({ op: 'switch_tab', index: count(args, 'index', 0) }),
      );

      return result;
    },
  },
  {
    name: 'browser_list_tabs',
    group: 'browser',
    summary: 'List the browser tabs with their titles and which one is shown.',
    input: { name: NAME },
    required: ['name'],
    returns: 'JSON list of { index, url, title, active }',
    run: (api, args) => api.browserListTabs(text(args, 'name')),
  },
  {
    name: 'browser_reset',
    group: 'browser',
    summary:
      'Restart the browser in a thread and keep its cookies. Use it when a page is wedged and every other browser call fails.',
    input: { name: NAME },
    required: ['name'],
    returns: '{ url, title } of the restarted browser',
    run: (api, args) => api.resetBrowser(text(args, 'name')),
  },
  {
    name: 'browser_get_cookies',
    group: 'browser',
    summary: 'Read the cookie jar of the browser.',
    input: { name: NAME },
    required: ['name'],
    returns: 'JSON list of cookies',
    run: (api, args) => api.browserGetCookies(text(args, 'name')),
  },
  {
    name: 'browser_set_cookies',
    group: 'browser',
    summary: 'Replace the cookie jar of the browser with the given cookies.',
    input: {
      name: NAME,
      cookies: { type: 'string', description: 'JSON list of { name, value, domain, path }' },
    },
    required: ['name', 'cookies'],
    returns: 'How many cookies were set',
    run: (api, args) => api.browserSetCookies(text(args, 'name'), text(args, 'cookies')),
  },
  {
    name: 'thread_repo',
    group: 'threads',
    summary:
      'Clone a git repo into a thread that already exists. An empty /workspace gets the repo at its root; a workspace with files gets the repo in a subdirectory named after it.',
    input: {
      name: NAME,
      repo: { type: 'string', description: 'Git URL, for example https://github.com/owner/repo' },
    },
    required: ['name', 'repo'],
    returns: '{ repo, path, cloned }',
    run: (api, args) => api.attachRepo(text(args, 'name'), text(args, 'repo')),
  },
  {
    name: 'browser_run',
    group: 'browser',
    summary:
      'Run a deterministic script of browser steps in order: open, new_tab, switch_tab, click, type, eval, wait, screenshot. Stops on the first failing step.',
    input: {
      name: NAME,
      steps: {
        type: 'string',
        description:
          'JSON list of steps. Each step is an object with one op, for example {"op":"open","url":"https://example.com"}, {"op":"click","ref":"e3"}, {"op":"type","text":"hello","ref":"e1"}, {"op":"eval","expression":"document.title"}, {"op":"wait","text":"Dashboard"}, {"op":"wait_ms","ms":1000}, {"op":"screenshot"}. Ops never need approval.',
      },
      expect: {
        type: 'string',
        description: 'Optional text that the last step result must contain.',
      },
      saveAs: {
        type: 'string',
        description:
          'Optional name; when the run succeeds, save the steps as a named goal for deterministic replay.',
      },
    },
    required: ['name', 'steps'],
    returns:
      'JSON of { steps: [{ index, op, ok, durationMs, result }...], failedIndex?, error?, expectPass?, savedGoal? }',
    run: async (api, args) => {
      const output = (await runBrowserSteps(
        api,
        text(args, 'name'),
        text(args, 'steps'),
        optional(args, 'expect'),
      )) as Record<string, unknown>;
      const saveAs = optional(args, 'saveAs');

      if (saveAs !== undefined && output.failedIndex === undefined) {
        await api.goalSave(text(args, 'name'), saveAs, text(args, 'steps'));
        output.savedGoal = saveAs;
      }

      return output;
    },
  },
  {
    name: 'goal_save',
    group: 'browser',
    summary:
      'Save a named goal from the recorded browser interactions, or from an explicit steps list. The recording clears after a recorded save.',
    input: {
      name: NAME,
      goal: { type: 'string', description: 'Goal name, for example "login-dash"' },
      steps: {
        type: 'string',
        description:
          'Optional JSON list of steps to save instead of the recorded interactions. Omitted saves the recorded list.',
      },
    },
    required: ['name', 'goal'],
    returns: '{ goal, steps, source }',
    run: (api, args) =>
      api.goalSave(text(args, 'name'), text(args, 'goal'), optional(args, 'steps') ?? '[]'),
  },
  {
    name: 'goal_run',
    group: 'browser',
    summary: 'Run a saved goal deterministically with one call. Zero model tokens per replay.',
    input: {
      name: NAME,
      goal: { type: 'string', description: 'Goal name' },
      expect: {
        type: 'string',
        description: 'Optional text that the last step result must contain.',
      },
    },
    required: ['name', 'goal'],
    returns: 'JSON of { goal, steps, expect } with per-step receipts',
    run: async (api, args) => {
      const steps = await api.goalRun(text(args, 'name'), text(args, 'goal'));
      const output = await runBrowserSteps(
        api,
        text(args, 'name'),
        JSON.stringify(steps),
        optional(args, 'expect'),
      );

      return { goal: text(args, 'goal'), ...output };
    },
  },
  {
    name: 'goal_list',
    group: 'browser',
    summary: 'List the saved goals on a thread, with their step counts.',
    input: { name: NAME },
    required: ['name'],
    returns: 'Array of { goal, steps }',
    run: (api, args) => api.goalList(text(args, 'name')),
  },
  {
    name: 'sheet_save',
    group: 'browser',
    summary:
      'Save a named expectation sheet: a goal plus the text its last step result must contain.',
    input: {
      name: NAME,
      sheet: { type: 'string', description: 'Sheet name, for example "site-still-works"' },
      goal: { type: 'string', description: 'Goal name the sheet runs' },
      expect: { type: 'string', description: 'Text the last step result must contain' },
    },
    required: ['name', 'sheet', 'goal', 'expect'],
    returns: '{ sheet, goal, expect }',
    run: (api, args) =>
      api.sheetSave(
        text(args, 'name'),
        text(args, 'sheet'),
        text(args, 'goal'),
        text(args, 'expect'),
      ),
  },
  {
    name: 'sheet_run',
    group: 'browser',
    summary: 'Run an expectation sheet: replay its goal and check the expected text holds.',
    input: {
      name: NAME,
      sheet: { type: 'string', description: 'Sheet name' },
    },
    required: ['name', 'sheet'],
    returns: 'JSON of { sheet, goal, pass, receipt }',
    run: async (api, args) => {
      const saved = await api.sheetRun(text(args, 'name'), text(args, 'sheet'));
      const output = (await runBrowserSteps(
        api,
        text(args, 'name'),
        JSON.stringify(saved.steps),
        saved.expect,
      )) as Record<string, unknown>;
      const expectResult = output.expect as { text: string; found: boolean } | undefined;

      if (expectResult?.found !== true)
        throw new CapabilityInputError(
          `sheet ${text(args, 'sheet')} did not reproduce: expected "${saved.expect}"`,
        );

      return {
        sheet: text(args, 'sheet'),
        pass: true,
        receipt: output,
      };
    },
  },
  {
    name: 'sheet_list',
    group: 'browser',
    summary: 'List the saved expectation sheets on a thread.',
    input: { name: NAME },
    required: ['name'],
    returns: 'Array of { sheet, goal, expect }',
    run: (api, args) => api.sheetList(text(args, 'name')),
  },
  {
    name: 'goal_clear',
    group: 'browser',
    summary: 'Clear the recorded interactions, or one named goal when goal is given.',
    input: {
      name: NAME,
      goal: { type: 'string', description: 'Optional goal name to remove' },
    },
    required: ['name'],
    returns: '{ cleared }',
    run: (api, args) => api.goalClear(text(args, 'name'), optional(args, 'goal') ?? ''),
  },
  {
    name: 'thread_compact',
    group: 'computer',
    summary: 'Summarise the conversation and save the disk, as one recorded pair.',
    input: { name: NAME },
    required: ['name'],
    returns: 'The saved pair: { at, reason, snapshot, summaryEntry }',
    run: (api, args) => api.compact(text(args, 'name')),
  },
  {
    name: 'thread_message',
    group: 'threads',
    summary:
      'Send a message from one thread to another. The receiver starts a turn now, or queues it until its current turn ends. Returns at once.',
    input: {
      from: { type: 'string', description: 'The sending thread' },
      to: { type: 'string', description: 'The receiving thread' },
      text: { type: 'string', description: 'The message' },
    },
    required: ['from', 'to', 'text'],
    returns: '{ queued }',
    run: (api, args) => api.message(text(args, 'from'), text(args, 'to'), text(args, 'text')),
  },
  {
    name: 'thread_wait',
    group: 'threads',
    summary: 'Wait until a thread finishes its turn, up to seconds, and return its last answer.',
    input: { name: NAME, seconds: { type: 'number', description: 'At most 600; default 120' } },
    required: ['name'],
    returns: '{ done, answer }',
    run: (api, args) =>
      api.wait(text(args, 'name'), Math.min(Math.max(count(args, 'seconds', 120), 1), 600)),
  },
  {
    name: 'thread_context_budget',
    group: 'threads',
    summary:
      'Set a smaller context window for a thread, in tokens, or 0 for the model limit. The thread compacts at 75% of it and continues from its HANDOFF: note.',
    input: {
      name: NAME,
      tokens: { type: 'number', description: 'Context size in tokens; 0 clears it' },
    },
    required: ['name', 'tokens'],
    returns: 'The usage, with contextWindow',
    run: (api, args) => api.setContextBudget(text(args, 'name'), count(args, 'tokens', 0) || null),
  },
  {
    name: 'model_list',
    group: 'threads',
    summary:
      'List the models you can pick: the gateway models plus every Workers AI text model with tool use on your account, newest first. Refreshed from Cloudflare every hour.',
    input: {},
    required: [],
    returns: 'Model ids with label, context window, price per million tokens, and vision support',
    run: (api) => api.models(),
  },
  {
    name: 'thread_model',
    group: 'threads',
    summary:
      'Choose the model for a thread, for example gateway/claude-opus-5-5 or a Workers AI model id. With Sign in with Cloudflare it runs on your own account.',
    input: { name: NAME, model: { type: 'string', description: 'A model id from the model list' } },
    required: ['name', 'model'],
    returns: 'The usage, with the context window of the new model',
    run: (api, args) => api.setModel(text(args, 'name'), text(args, 'model')),
  },
  {
    name: 'thread_stop',
    group: 'threads',
    summary:
      'Stop the agent turn now. A running tool call ends at once and the thread stays awake.',
    input: { name: NAME },
    required: ['name'],
    returns: 'null',
    run: (api, args) => api.stop(text(args, 'name')),
  },
  {
    name: 'thread_pause',
    group: 'computer',
    summary: 'Save the disk and turn the computer off. The next call resumes it.',
    input: { name: NAME },
    required: ['name'],
    returns: 'The saved pair, or null if it was already off',
    run: (api, args) => api.pause(text(args, 'name')),
  },
  {
    name: 'thread_resize',
    group: 'computer',
    summary:
      'Change the container size. A running computer is paused and restarted at the new size.',
    input: { name: NAME, size: SIZE },
    required: ['name', 'size'],
    returns: '{ size, restarted }',
    run: (api, args) => {
      const size = sizeOf(args);

      if (size === undefined)
        throw new CapabilityInputError(`size must be one of ${SIZES.join(', ')}`);

      return api.resize(text(args, 'name'), size);
    },
  },
  {
    name: 'thread_extensions',
    group: 'extensions',
    summary:
      'Load stock pi extensions into the thread. Each source is an https git URL (optionally #ref) or a ./path inside /workspace, for example an uploaded folder. Their tools run inside the thread computer and the agent can call them from its next turn. An empty list removes them.',
    input: {
      name: NAME,
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'For example ["https://github.com/owner/repo", "./uploads/my-extension"]',
      },
    },
    required: ['name', 'sources'],
    returns: '{ tools: [{ name, description, extension }], errors, unsupported }',
    run: (api, args) => api.setExtensions(text(args, 'name'), list(args, 'sources')),
  },
  {
    name: 'base_prepare',
    group: 'bases',
    summary:
      'Clone a repo, run a setup command once, and snapshot it. New threads on that repo start warm.',
    input: {
      repo: { type: 'string', description: 'Git URL' },
      setup: { type: 'string', description: 'Optional setup command, for example npm ci' },
    },
    required: ['repo'],
    returns: 'The base record',
    run: (api, args) => api.prepare(text(args, 'repo'), optional(args, 'setup') ?? ''),
  },
];

export const capabilityNamed = (name: string): Capability | undefined =>
  CAPABILITIES.find((capability) => capability.name === name);

export const inputSchema = (capability: Capability) => ({
  type: 'object',
  properties: capability.input,
  required: [...capability.required],
});
