export const APPROVAL_WAIT_MS = 24 * 60 * 60 * 1000;

export type Risk = 'push' | 'deploy' | 'delete';

export type PendingApproval = {
  readonly key: string;
  readonly taskId: number;
  readonly tool: string;
  readonly args: string;
  readonly risk: Risk;
  readonly until: number;
};

export class UnknownApproval extends Error {
  constructor() {
    super('No open question has this key. It was answered, or its time ran out.');
  }
}

const SHELL_SEPARATORS = new Set([';', '&&', '||', '|', '&', '(', ')', '{', '}', '\n']);

const RUNNERS = new Set(['npx', 'bunx', 'pnpm', 'yarn', 'exec', 'sudo', 'env', 'command', 'time']);

const tokenize = (command: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;

  const flush = () => {
    if (current !== '') tokens.push(current);
    current = '';
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? '';
    const pair = command.slice(index, index + 2);

    if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (pair === '&&' || pair === '||') {
      flush();
      tokens.push(pair);
      index += 1;
    } else if (SHELL_SEPARATORS.has(char)) {
      flush();
      tokens.push(char);
    } else if (char === ' ' || char === '\t') {
      flush();
    } else {
      current += char;
    }
  }

  flush();

  return tokens;
};

const commands = (command: string): string[][] => {
  const groups: string[][] = [[]];

  for (const token of tokenize(command)) {
    if (SHELL_SEPARATORS.has(token) || token === '&&' || token === '||') groups.push([]);
    else groups.at(-1)?.push(token);
  }

  return groups.filter((group) => group.length > 0);
};

const withoutRunners = (words: readonly string[]): string[] => {
  let start = 0;

  while (start < words.length) {
    const word = words[start] ?? '';

    if (RUNNERS.has(word) || word.includes('=')) start += 1;
    else break;
  }

  return words.slice(start);
};

const baseName = (word: string): string => word.slice(word.lastIndexOf('/') + 1);

const gitVerb = (words: readonly string[]): string | null => {
  let index = 1;

  while (index < words.length) {
    const word = words[index] ?? '';

    if (word === '-C' || word === '-c') index += 2;
    else if (word.startsWith('-')) index += 1;
    else return word;
  }

  return null;
};

const riskOfWords = (raw: readonly string[]): Risk | null => {
  const words = withoutRunners(raw);
  const program = baseName(words[0] ?? '');

  if (program === 'git' && gitVerb(words) === 'push') return 'push';
  if (program === 'gh' && words[1] === 'pr' && words[2] === 'merge') return 'push';
  if (program === 'wrangler' && (words.includes('deploy') || words.includes('publish')))
    return 'deploy';
  if (program === 'wrangler' && words.includes('versions') && words.includes('deploy'))
    return 'deploy';
  if (program === 'npm' && words[1] === 'publish') return 'deploy';
  if ((program === 'npm' || program === 'bun') && words[1] === 'run' && words[2] === 'deploy')
    return 'deploy';

  return null;
};

const SHELLS = new Set(['bash', 'sh', 'zsh']);
const SCRIPT_FLAGS = new Set(['-c', '-lc', '-ec', '-xc']);

const shellScript = (words: readonly string[]): string | null => {
  if (!SHELLS.has(baseName(words[0] ?? ''))) return null;

  const flag = words.findIndex((word) => SCRIPT_FLAGS.has(word));

  return flag < 0 ? null : (words[flag + 1] ?? null);
};

export const riskOfCommand = (command: string): Risk | null => {
  for (const words of commands(command)) {
    const risk = riskOfWords(words);

    if (risk !== null) return risk;

    const script = shellScript(withoutRunners(words));
    const nested = script === null ? null : riskOfCommand(script);

    if (nested !== null) return nested;
  }

  return null;
};

const TOOL_RISKS: Readonly<Record<string, Risk>> = {
  thread_delete: 'delete',
};

export const riskOf = (tool: string, args: Readonly<Record<string, unknown>>): Risk | null => {
  const named = TOOL_RISKS[tool];

  if (named !== undefined) return named;

  if (tool === 'run' || tool === 'job_start') {
    const command = args.command;

    return typeof command === 'string' ? riskOfCommand(command) : null;
  }

  return null;
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );

    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
};

export const approvalKey = async (
  callId: string,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<string> => {
  const bytes = new TextEncoder().encode(`${callId}\n${tool}\n${canonical(args)}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

  return [...digest]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const RISK_LABELS: Readonly<Record<Risk, string>> = {
  push: 'push code to a remote',
  deploy: 'deploy or publish',
  delete: 'delete a thread',
};
