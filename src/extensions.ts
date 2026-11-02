import type { JsonValue } from '@earendil-works/chord';
import {
  defineExtension,
  defineTool,
  type Extension,
  type ToolRegistration,
} from '@earendil-works/pi-durable';
import type { Computer } from './computer';

export const PI_HOST_DIR = '/opt/pi-ext';

const EXTENSIONS_DIR = '/workspace/.coil/extensions';

const GIT_SOURCE = /^(https:\/\/[\w.-]+(?::\d+)?(?:\/[\w.~-]+)+)(?:#([\w./-]*)(?::([\w./-]+))?)?$/u;

const LOCAL_SOURCE = /^\.\/[\w./-]+$/u;

export type ExtensionSource = string;

export type ExtensionTool = {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonValue;
  readonly extension: string;
};

export type ExtensionReport = {
  readonly tools: readonly ExtensionTool[];
  readonly errors: readonly { readonly path: string; readonly error: string }[];
  readonly unsupported: readonly {
    readonly kind: string;
    readonly name: string;
    readonly extension: string;
  }[];
};

export type ExtensionCallResult = {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly details: JsonValue;
  readonly isError: boolean;
};

export class ExtensionSourceError extends Error {}

const WORKSPACE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w.@+ -][\w.@+ /-]*$/u;

export const workspaceTarget = (path: string): string => {
  const trimmed = path.trim().startsWith('./') ? path.trim().slice(2) : path.trim();

  if (!WORKSPACE_RELATIVE.test(trimmed))
    throw new ExtensionSourceError(`paths are relative to /workspace and stay inside it: ${path}`);

  return `/workspace/${trimmed}`;
};

type ParsedSource =
  | {
      readonly kind: 'git';
      readonly url: string;
      readonly ref: string | null;
      readonly subdir: string | null;
    }
  | { readonly kind: 'local'; readonly path: string };

export const parseSource = (source: string): ParsedSource => {
  const trimmed = source.trim();

  if (LOCAL_SOURCE.test(trimmed) && !trimmed.includes('..'))
    return { kind: 'local', path: `/workspace/${trimmed.slice(2)}` };

  const git = GIT_SOURCE.exec(trimmed);

  if (git?.[1] !== undefined && !(git[3] ?? '').includes('..'))
    return {
      kind: 'git',
      url: git[1],
      ref: git[2] === undefined || git[2] === '' ? null : git[2],
      subdir: git[3] ?? null,
    };

  throw new ExtensionSourceError(
    `extension sources are https git URLs (optionally #ref or #ref:subdir) or ./paths inside /workspace: ${source}`,
  );
};

const slugOf = (url: string) =>
  url
    .slice('https:'.length + 2)
    .replace(/\.git$/u, '')
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .slice(0, 80);

const quote = (value: string) => `'${value.replace(/'/gu, `'\\''`)}'`;

const fetchCommand = (url: string, ref: string | null, target: string, folder: string) =>
  [
    `if [ ! -d ${quote(`${target}/.git`)} ]; then git clone --depth 1 ${ref === null ? '' : `--branch ${quote(ref)}`} ${quote(url)} ${quote(target)}; fi`,
    `cd ${quote(folder)}`,
    `if [ -f package.json ] && [ ! -d node_modules ]; then npm install --omit=dev --no-audit --no-fund --ignore-scripts >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1; fi`,
  ].join(' && ');

export const preparePaths = async (
  computer: Computer,
  sources: readonly ExtensionSource[],
): Promise<string[]> => {
  const paths: string[] = [];

  for (const source of sources) {
    const parsed = parseSource(source);

    if (parsed.kind === 'local') {
      paths.push(parsed.path);
      continue;
    }

    const target = `${EXTENSIONS_DIR}/${slugOf(`${parsed.url}#${parsed.ref ?? ''}`)}`;
    const folder = parsed.subdir === null ? target : `${target}/${parsed.subdir}`;
    const fetched = await computer.exec([
      'bash',
      '-lc',
      `mkdir -p ${quote(EXTENSIONS_DIR)} && ${fetchCommand(parsed.url, parsed.ref, target, folder)}`,
    ]);

    if (fetched.exitCode !== 0)
      throw new ExtensionSourceError(`could not fetch ${source}: ${fetched.stderr.slice(-400)}`);

    paths.push(folder);
  }

  return paths;
};

const HOST_PORT = 7788;

const schemaOf = (parameters: JsonValue) =>
  typeof parameters === 'object' && parameters !== null && !Array.isArray(parameters)
    ? Object.fromEntries(Object.entries(parameters))
    : { type: 'object', properties: {} };

const ensureHost = `if ! curl -s -m 2 -o /dev/null http://127.0.0.1:${HOST_PORT}/; then bash -c 'cd ${PI_HOST_DIR} && nohup node pi-host.mjs serve ${HOST_PORT} </dev/null >${PI_HOST_DIR}/host.log 2>&1 & disown' </dev/null >/dev/null 2>&1; for i in $(seq 1 100); do curl -s -m 1 -o /dev/null http://127.0.0.1:${HOST_PORT}/ && break; sleep 0.2; done; fi`;

const postToHost = async (computer: Computer, route: string, body: unknown): Promise<unknown> => {
  const bodyPath = `${PI_HOST_DIR}/calls/${crypto.randomUUID()}.json`;

  await computer.writeFile(bodyPath, JSON.stringify(body));

  const ran = await computer.exec([
    'bash',
    '-lc',
    `${ensureHost}; curl -s -m 280 -X POST -H 'content-type: application/json' --data-binary @${quote(bodyPath)} http://127.0.0.1:${HOST_PORT}${route}; status=$?; rm -f ${quote(bodyPath)}; exit $status`,
  ]);

  try {
    return JSON.parse(ran.stdout);
  } catch {
    return {
      error: (ran.stderr || ran.stdout || `pi extension host exited ${ran.exitCode}`).slice(-1200),
    };
  }
};

const failure = (value: unknown) =>
  typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
    ? value.error
    : JSON.stringify(value).slice(0, 1200);

export const isExtensionReport = (value: unknown): value is ExtensionReport =>
  typeof value === 'object' && value !== null && 'tools' in value && Array.isArray(value.tools);

export const describeExtensions = async (
  computer: Computer,
  paths: readonly string[],
): Promise<ExtensionReport> => {
  if (paths.length === 0) return { tools: [], errors: [], unsupported: [] };

  await postToHost(computer, '/reset', {});
  const report = await postToHost(computer, '/describe', { paths });

  if (!isExtensionReport(report))
    throw new ExtensionSourceError(`the pi extension host failed: ${failure(report)}`);

  return report;
};

const isCallResult = (value: unknown): value is ExtensionCallResult =>
  typeof value === 'object' && value !== null && 'content' in value && Array.isArray(value.content);

export const callExtensionTool = async (
  computer: Computer,
  paths: readonly string[],
  tool: string,
  args: unknown,
): Promise<ExtensionCallResult> => {
  const result = await postToHost(computer, '/call', { paths, tool, args: args ?? {} });

  if (isCallResult(result)) return result;

  return {
    content: [{ type: 'text', text: `the pi extension host failed: ${failure(result)}` }],
    details: null,
    isError: true,
  };
};

export const extensionTools = (
  computer: () => Promise<Computer>,
  paths: readonly string[],
  report: ExtensionReport,
): Extension =>
  defineExtension({
    name: 'pi-extensions',
    tools: report.tools.map(
      (tool): ToolRegistration =>
        defineTool({
          name: tool.name,
          description: `${tool.description} (pi extension ${tool.extension})`,
          parameters: schemaOf(tool.parameters),
          replay: 'unsafe',
          executionMode: 'sequential',
          execute: async (args) => {
            const result = await callExtensionTool(await computer(), paths, tool.name, args);

            return {
              output: [...result.content],
              details: result.details,
              ...(result.isError ? { isError: true } : {}),
            };
          },
        }),
    ),
  });
