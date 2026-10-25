import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool, type Extension } from '@earendil-works/pi-durable';
import type { Connector } from './config';
import { type McpTool, McpUnauthorized, openMcp } from './mcp-client';

export type ConnectorTokens = {
  readonly accessToken: (connector: string) => Promise<string | null>;
  readonly rejected: (connector: string) => Promise<string | null>;
};

export const CONNECT_HINT = (connector: Connector) =>
  `Not connected to ${connector.id}. Ask the user to open Settings (the gear, or ⌘,), choose Connectors, and connect ${connector.id}; then try again.`;

const toolName = (connector: Connector, tool: string) =>
  `${connector.id.replaceAll('-', '_')}__${tool}`.slice(0, 64);

const withToken = async <T>(
  connector: Connector,
  tokens: ConnectorTokens,
  use: (token: string) => Promise<T>,
): Promise<T | string> => {
  const token = await tokens.accessToken(connector.id);

  if (token === null) return CONNECT_HINT(connector);

  try {
    return await use(token);
  } catch (cause) {
    if (!(cause instanceof McpUnauthorized)) throw cause;

    const fresh = await tokens.rejected(connector.id);

    return fresh === null ? CONNECT_HINT(connector) : use(fresh);
  }
};

const text = (value: string, isError = false) => ({
  output: [{ type: 'text' as const, text: value }],
  details: null,
  ...(isError ? { isError: true } : {}),
});

const CODE_MODE_SEARCH = 'portal_codemode_search';

type DescribedTool = {
  readonly tool: string;
  readonly description: string;
  readonly arguments: unknown;
};

const allowedFromList = (connector: Connector, listed: readonly McpTool[]): DescribedTool[] =>
  listed
    .filter((each) => connector.expose.includes(each.name))
    .map((each) => ({
      tool: toolName(connector, each.name),
      description: each.description,
      arguments: each.inputSchema,
    }));

const notInCatalog = (connector: Connector, listed: readonly McpTool[]) =>
  `None of the allowed ${connector.id} tools (${connector.expose.join(', ')}) are in its catalog. The catalog has: ${listed.map((each) => each.name).join(', ') || 'no tools'}.`;

export const codeModeSearchFor = (names: readonly string[]) =>
  `async () => { const wanted = ${JSON.stringify(names)}; const all = await codemode.tools(); return all.filter((tool) => wanted.includes(tool.name)); }`;

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};

const parsedJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const describeFromCodeMode = (connector: Connector, answer: string): string => {
  const parsed = parsedJson(answer);
  const body = recordOf(parsed);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(body.result) ? body.result : null;

  if (items === null) return answer;

  const described: DescribedTool[] = items.flatMap((item) => {
    const tool = recordOf(item);
    const name = typeof tool.name === 'string' ? tool.name : null;

    if (name === null || !connector.expose.includes(name)) return [];

    return [
      {
        tool: toolName(connector, name),
        description: typeof tool.description === 'string' ? tool.description : '',
        arguments: tool.inputSchema ?? tool.input_schema ?? tool.parameters ?? { type: 'object' },
      },
    ];
  });

  return described.length > 0 ? JSON.stringify(described, null, 2) : answer;
};

const describeName = (connector: Connector) => toolName(connector, 'describe');

const describeTool = (connector: Connector, tokens: ConnectorTokens, send: typeof fetch) =>
  defineTool({
    name: describeName(connector),
    description: `List the ${connector.id} tools you may call, with their argument schemas. ${connector.description}`,
    parameters: Type.Object({}),
    replay: 'safe',
    executionMode: 'parallel',
    execute: async () => {
      const result = await withToken(connector, tokens, async (token) =>
        (await openMcp(connector.upstream, token, send)).listTools(),
      );

      if (typeof result === 'string') return text(result, true);

      const listed = allowedFromList(connector, result);

      if (listed.length > 0) return text(JSON.stringify(listed, null, 2));

      if (!result.some((each) => each.name === CODE_MODE_SEARCH))
        return text(notInCatalog(connector, result), true);

      const searched = await withToken(connector, tokens, async (token) =>
        (await openMcp(connector.upstream, token, send)).callTool(CODE_MODE_SEARCH, {
          code: codeModeSearchFor(connector.expose),
        }),
      );

      if (typeof searched === 'string') return text(searched, true);
      if (searched.isError) return text(searched.text, true);

      return text(describeFromCodeMode(connector, searched.text));
    },
  });

export const connectorTools = (
  connectors: readonly Connector[],
  tokens: ConnectorTokens,
  send: typeof fetch = fetch,
): Extension =>
  defineExtension({
    name: 'connectors',
    tools: connectors.flatMap((connector) => [
      describeTool(connector, tokens, send),
      ...connector.expose.map((tool) =>
        defineTool({
          name: toolName(connector, tool),
          description: `${tool} from the ${connector.id} connector (${connector.description}). Arguments follow that tool's own schema: call ${describeName(connector)} first to read it.`,
          parameters: Type.Unsafe({ type: 'object', additionalProperties: true }),
          replay: 'unsafe',
          executionMode: 'parallel',
          execute: async (args) => {
            const result = await withToken(connector, tokens, async (token) =>
              (await openMcp(connector.upstream, token, send)).callTool(tool, args),
            );

            return typeof result === 'string'
              ? text(result, true)
              : text(result.text === '' ? '(no output)' : result.text, result.isError);
          },
        }),
      ),
    ]),
  });
