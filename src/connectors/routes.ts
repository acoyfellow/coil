import { type ConnectorEnv, connectorNamed, connectorsOf } from './config';
import type { ConnectorStore } from './store';

export type ConnectorRouteEnv = ConnectorEnv & {
  readonly CONNECTORS: DurableObjectNamespace<ConnectorStore>;
};

const ROUTE = /^\/connectors(?:\/([a-z][a-z0-9-]{0,31})\/(start|callback|disconnect))?$/u;
const RETURN_PATH = /^\/(t\/[a-z0-9-]{1,80})?$/u;

export const isConnectorPath = (pathname: string) => ROUTE.test(pathname);

export const storeFor = (env: ConnectorRouteEnv, owner: string) => env.CONNECTORS.getByName(owner);

const redirect = (location: string) =>
  new Response(null, {
    status: 303,
    headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

export const connectorStates = async (env: ConnectorRouteEnv, owner: string) => {
  const connected = new Set((await storeFor(env, owner).status()).map((each) => each.id));

  return connectorsOf(env).map((connector) => ({
    id: connector.id,
    description: connector.description,
    connected: connected.has(connector.id),
  }));
};

const backOf = (request: Request) => {
  const referer = URL.parse(request.headers.get('referer') ?? '');
  const path =
    referer !== null && referer.origin === new URL(request.url).origin ? referer.pathname : '/';

  return RETURN_PATH.test(path) ? path : '/';
};

export const settingsPath = (back: string, problem: string | null = null) => {
  const query = new URLSearchParams({ settings: 'connectors' });

  if (problem !== null) query.set('connector_error', problem.slice(0, 300));

  return `${RETURN_PATH.test(back) ? back : '/'}?${query.toString()}`;
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
    return request.method === 'GET' ? redirect(settingsPath('/')) : null;

  if (connectorNamed(env, id) === null)
    return redirect(settingsPath('/', `No connector named ${id}.`));

  const store = storeFor(env, owner);

  if (action === 'start' && request.method === 'POST') {
    const back = backOf(request);

    try {
      return redirect((await store.start(id, url.origin, back)).url);
    } catch (cause) {
      console.error('connector start failed', { connector: id, reason: reason(cause) });

      return redirect(settingsPath(back, `Could not start sign-in for ${id}: ${reason(cause)}`));
    }
  }

  if (action === 'callback' && request.method === 'GET') {
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code') ?? '';
    const refused = url.searchParams.get('error');

    if (refused !== null)
      return redirect(settingsPath('/', `Sign-in for ${id} was refused: ${refused}`));

    if (state === '' || code === '')
      return redirect(settingsPath('/', 'The sign-in answer is incomplete.'));

    try {
      const finished = await store.finish(id, state, code);

      return redirect(
        finished.ok ? settingsPath(finished.back) : settingsPath('/', finished.reason),
      );
    } catch (cause) {
      console.error('connector callback failed', { connector: id, reason: reason(cause) });

      return redirect(settingsPath('/', `Could not finish sign-in for ${id}: ${reason(cause)}`));
    }
  }

  if (action === 'disconnect' && request.method === 'POST') {
    await store.disconnect(id);

    return redirect(settingsPath(backOf(request)));
  }

  return new Response('method not allowed', { status: 405 });
};
