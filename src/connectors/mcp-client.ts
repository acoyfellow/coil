export type McpTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
};

export type McpCallResult = {
  readonly text: string;
  readonly isError: boolean;
};

export class McpUnauthorized extends Error {}

export class McpFailed extends Error {}

const PROTOCOL = '2025-06-18';
const CLIENT = { name: 'coil', version: '1.0.0' };
const TIMEOUT_MS = 60_000;
const MAX_TEXT = 60_000;

type Answer = { readonly result?: unknown; readonly error?: { readonly message?: string } };

const fields = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};

const answerOf = (body: string, contentType: string): Answer => {
  const json = contentType.includes('text/event-stream')
    ? body
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .findLast((line) => line.startsWith('{'))
    : body;

  if (json === undefined || json === '') throw new McpFailed('the MCP server sent no answer');

  const parsed = fields(JSON.parse(json));
  const error = fields(parsed.error);

  return {
    result: parsed.result,
    error:
      'error' in parsed
        ? { message: typeof error.message === 'string' ? error.message : 'error' }
        : undefined,
  };
};

export type McpSession = {
  readonly listTools: () => Promise<McpTool[]>;
  readonly callTool: (name: string, args: unknown) => Promise<McpCallResult>;
};

export const openMcp = async (
  upstream: string,
  token: string,
  send: typeof fetch = fetch,
): Promise<McpSession> => {
  let session: string | null = null;
  let next = 1;

  const post = async (message: Record<string, unknown>): Promise<Answer | null> => {
    const response = await send(upstream, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': PROTOCOL,
        ...(session === null ? {} : { 'mcp-session-id': session }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...message }),
    });

    if (response.status === 401 || response.status === 403)
      throw new McpUnauthorized(`the MCP server refused the token (HTTP ${response.status})`);

    if (!response.ok)
      throw new McpFailed(`MCP HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);

    session = response.headers.get('mcp-session-id') ?? session;

    if (!('id' in message)) return null;

    return answerOf(await response.text(), response.headers.get('content-type') ?? '');
  };

  const request = async (method: string, params: unknown): Promise<unknown> => {
    const answer = await post({ id: next++, method, params });

    if (answer?.error !== undefined) throw new McpFailed(answer.error.message);

    return answer?.result;
  };

  await request('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT });
  await post({ method: 'notifications/initialized' });

  return {
    listTools: async () => {
      const tools: McpTool[] = [];
      let cursor: string | undefined;

      do {
        const page = fields(await request('tools/list', cursor === undefined ? {} : { cursor }));
        const items = Array.isArray(page.tools) ? page.tools : [];

        for (const item of items) {
          const tool = fields(item);

          if (typeof tool.name === 'string')
            tools.push({
              name: tool.name,
              description: typeof tool.description === 'string' ? tool.description : '',
              inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
            });
        }

        cursor = typeof page.nextCursor === 'string' ? page.nextCursor : undefined;
      } while (cursor !== undefined);

      return tools;
    },
    callTool: async (name, args) => {
      const result = fields(await request('tools/call', { name, arguments: args ?? {} }));
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .map((part) => {
          const block = fields(part);

          return block.type === 'text' && typeof block.text === 'string'
            ? block.text
            : JSON.stringify(block);
        })
        .join('\n');

      return { text: text.slice(0, MAX_TEXT), isError: result.isError === true };
    },
  };
};
