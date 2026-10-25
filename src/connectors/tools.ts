import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool, type Extension } from '@earendil-works/pi-durable';
import type { Connector } from './config';
import { McpUnauthorized, openMcp } from './mcp-client';

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

      const allowed = result
        .filter((each) => connector.expose.includes(each.name))
        .map((each) => ({
          tool: toolName(connector, each.name),
          description: each.description,
          arguments: each.inputSchema,
        }));

      return text(JSON.stringify(allowed, null, 2));
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
