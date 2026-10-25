import { type ConnectorEnv, connectorNamed, connectorsOf } from './config';
import { connectorsPage } from './page';
import type { ConnectorStore } from './store';

export type ConnectorRouteEnv = ConnectorEnv & {
  readonly CONNECTORS: DurableObjectNamespace<ConnectorStore>;
};

const ROUTE = /^\/connectors(?:\/([a-z][a-z0-9-]{0,31})\/(start|callback|disconnect))?$/u;
const RETURN_PATH = /^\/(t\/[a-z0-9-]{1,80})?$/u;

export const isConnectorPath = (pathname: string) => ROUTE.test(pathname);

export const storeFor = (env: ConnectorRouteEnv, owner: string) => env.CONNECTORS.getByName(owner);

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'referrer-policy': 'no-referrer',
    },
  });

const redirect = (location: string) =>
  new Response(null, {
    status: 303,
    headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

const backOf = (request: Request) => {
  const referer = URL.parse(request.headers.get('referer') ?? '');
  const path =
    referer !== null && referer.origin === new URL(request.url).origin ? referer.pathname : '/';

  return RETURN_PATH.test(path) ? path : '/';
};

const listing = async (
  env: ConnectorRouteEnv,
  owner: string,
  problem: string | null,
  status = 200,
) => {
  const connected = new Set((await storeFor(env, owner).status()).map((each) => each.id));

  return html(
    connectorsPage(
      connectorsOf(env).map((connector) => ({ connector, connected: connected.has(connector.id) })),
      problem,
    ),
    status,
  );
};

const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export const connectorRoute = async (
  request: Request,
  env: ConnectorRouteEnv,
  owner: string,
): Promise<Response | null> => {
  const url = new URL(request.url);
  const match = ROUTE.exec(url.pathname);

  if (match === null) return null;

  const [, id, action] = match;

  if (id === undefined || action === undefined)
    return request.method === 'GET' ? listing(env, owner, null) : null;

  if (connectorNamed(env, id) === null)
    return listing(env, owner, `No connector named ${id}.`, 404);

  const store = storeFor(env, owner);

  if (action === 'start' && request.method === 'POST') {
    try {
      return redirect((await store.start(id, url.origin, backOf(request))).url);
    } catch (cause) {
      console.error('connector start failed', { connector: id, reason: reason(cause) });

      return listing(env, owner, `Could not start sign-in for ${id}: ${reason(cause)}`, 502);
    }
  }

  if (action === 'callback' && request.method === 'GET') {
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code') ?? '';
    const refused = url.searchParams.get('error');

    if (refused !== null)
      return listing(env, owner, `Sign-in for ${id} was refused: ${refused}`, 400);

    if (state === '' || code === '')
      return listing(env, owner, 'The sign-in answer is incomplete.', 400);

    try {
      const finished = await store.finish(id, state, code);

      return finished.ok ? redirect('/connectors') : listing(env, owner, finished.reason, 400);
    } catch (cause) {
      console.error('connector callback failed', { connector: id, reason: reason(cause) });

      return listing(env, owner, `Could not finish sign-in for ${id}: ${reason(cause)}`, 502);
    }
  }

  if (action === 'disconnect' && request.method === 'POST') {
    await store.disconnect(id);

    return redirect('/connectors');
  }

  return new Response('method not allowed', { status: 405 });
};
