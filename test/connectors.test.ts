import { describe, expect, test } from 'vitest';
import { ConnectorConfigError, parseConnectors } from '../src/connectors/config';
import { McpUnauthorized, openMcp } from '../src/connectors/mcp-client';
import { SealKeyMissing, seal, unseal } from '../src/connectors/seal';
import { codeModeSearchFor, describeFromCodeMode } from '../src/connectors/tools';

const portal = {
  upstream: 'https://mcp.test/mcp',
  description: 'portal',
  auth: {
    authorizationEndpoint: 'https://auth.test/a',
    tokenEndpoint: 'https://auth.test/t',
    registrationEndpoint: 'https://auth.test/r',
    resource: 'https://mcp.test',
  },
  expose: ['wiki_search', 'wiki_search'],
};

describe('connector config', () => {
  test('no config means no connectors', () => {
    expect(parseConnectors(undefined)).toEqual([]);
    expect(parseConnectors('  ')).toEqual([]);
  });

  test('a good entry parses and the allowlist is deduplicated', () => {
    const [one] = parseConnectors(JSON.stringify({ 'ax-mcp': portal }));

    expect(one?.id).toBe('ax-mcp');
    expect(one?.expose).toEqual(['wiki_search']);
  });

  test.each([
    ['plain http upstream', { ...portal, upstream: 'http://mcp.test/mcp' }],
    ['credentials in a URL', { ...portal, upstream: 'https://u:p@mcp.test/mcp' }],
    ['an empty allowlist', { ...portal, expose: [] }],
    ['a bad tool name', { ...portal, expose: ['rm -rf'] }],
    ['no auth block', { ...portal, auth: undefined }],
  ])('refuses %s', (_, body) => {
    expect(() => parseConnectors(JSON.stringify({ 'ax-mcp': body }))).toThrow(ConnectorConfigError);
  });

  test('refuses a bad connector id', () => {
    expect(() => parseConnectors(JSON.stringify({ 'Bad Id': portal }))).toThrow(
      ConnectorConfigError,
    );
  });
});

describe('sealing', () => {
  const key = 'x'.repeat(40);

  test('round trips for the same owner', async () => {
    expect(await unseal(key, 'cf:a', await seal(key, 'cf:a', 'tok'))).toBe('tok');
  });

  test('a token sealed for one owner does not open for another', async () => {
    await expect(unseal(key, 'cf:b', await seal(key, 'cf:a', 'tok'))).rejects.toThrow();
  });

  test('a short or missing key is refused', async () => {
    await expect(seal('short', 'cf:a', 'tok')).rejects.toThrow(SealKeyMissing);
    await expect(seal(undefined, 'cf:a', 'tok')).rejects.toThrow(SealKeyMissing);
  });

  test('the sealed form does not contain the token', async () => {
    expect(await seal(key, 'cf:a', 'secret-token-value')).not.toContain('secret-token-value');
  });
});

describe('mcp client', () => {
  const server =
    (calls: string[], status = 200): typeof fetch =>
    async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const headers = new Headers(init?.headers);

      calls.push(
        `${body.method}|${headers.get('authorization')}|${headers.get('mcp-session-id') ?? ''}`,
      );

      if (status !== 200) return new Response('no', { status });

      if (body.method === 'initialize')
        return Response.json(
          { jsonrpc: '2.0', id: body.id, result: {} },
          { headers: { 'mcp-session-id': 's1' } },
        );

      if (body.method === 'tools/call')
        return new Response(
          `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'found 3 pages' }] } })}\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        );

      if (body.method === 'tools/list')
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [{ name: 'wiki_search', description: 'd', inputSchema: {} }] },
        });

      return new Response(null, { status: 202 });
    };

  test('initializes, keeps the session id, and reads an SSE answer', async () => {
    const calls: string[] = [];
    const session = await openMcp('https://mcp.test/mcp', 'tok', server(calls));

    expect(await session.callTool('wiki_search', { q: 'x' })).toEqual({
      text: 'found 3 pages',
      isError: false,
    });
    expect(calls).toEqual([
      'initialize|Bearer tok|',
      'notifications/initialized|Bearer tok|s1',
      'tools/call|Bearer tok|s1',
    ]);
  });

  test('lists tools', async () => {
    const session = await openMcp('https://mcp.test/mcp', 'tok', server([]));

    expect((await session.listTools()).map((tool) => tool.name)).toEqual(['wiki_search']);
  });

  test('a 401 is reported as unauthorized', async () => {
    await expect(openMcp('https://mcp.test/mcp', 'tok', server([], 401))).rejects.toThrow(
      McpUnauthorized,
    );
  });
});

describe('code mode portal describe', () => {
  const connector = {
    id: 'ax-mcp',
    upstream: 'https://mcp.test/mcp',
    description: 'portal',
    auth: portal.auth,
    expose: ['wiki_search_wiki'],
  };

  test('the search program asks only for allowed tools', () => {
    expect(codeModeSearchFor(['wiki_search_wiki'])).toContain('["wiki_search_wiki"]');
  });

  test('a code mode answer becomes allowed tools with schemas', () => {
    const answer = JSON.stringify({
      result: [
        { name: 'wiki_search_wiki', description: 'search', inputSchema: { type: 'object' } },
        { name: 'gitlab_delete_project', description: 'no', inputSchema: {} },
      ],
    });

    expect(JSON.parse(describeFromCodeMode(connector, answer))).toEqual([
      { tool: 'ax_mcp__wiki_search_wiki', description: 'search', arguments: { type: 'object' } },
    ]);
  });

  test('an answer it cannot read is passed through', () => {
    expect(describeFromCodeMode(connector, 'plain text')).toBe('plain text');
  });
});
