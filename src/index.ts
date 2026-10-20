import { Context } from 'effect';
import { gate } from './auth/gate';
import { CapabilityInputError, capabilityNamed } from './capabilities';
import { DIRECTORY_NAME } from './directory-name';
import { docsPage, llmsText } from './docs';
import { mcp } from './mcp';
import { notFoundPage } from './not-found-page';
import { isKnownPath } from './paths';
import { PLAYER_VIDEO, playerPage, withRanges } from './player';
import { serveRest } from './rest';
import { type Caller, handlersFor, isRpcPath, rpcHandler } from './rpc';
import { robots, sitemap } from './seo';
import { type Coil, coil, sharedView } from './service';
import { statsPage } from './stats-page';
import type { Env } from './thread';
import { APP_ENTRY } from './ui/app.generated';
import { page } from './ui/index';
import { sharedPage } from './ui/shared';
import { serviceWorker } from './ui/sw';
import { TERM_JS, TERM_VERSION } from './ui/term.generated';

export { Directory } from './directory';
export { CoilBridge } from './run';
export { Thread } from './thread';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const LOCAL_OWNER = 'local';

const THREAD_SOCKET = /^\/api\/threads\/([a-z0-9][a-z0-9-]{0,62})\/(terminal|browser|vnc)$/;

const THREAD_EVENTS = /^\/api\/threads\/([a-z0-9][a-z0-9-]{0,62})\/events$/;

const THREAD_UPLOAD = /^\/api\/threads\/([a-z0-9][a-z0-9-]{0,62})\/upload$/;

const UPLOAD_LIMIT = 10 * 1024 * 1024;

const UPLOAD_NAME = /^[\w.-]{1,120}$/;

const SHARED = /^\/s\/([A-Za-z0-9_-]{16,40})$/;

const CAPABILITY_PATH = /^\/api\/capabilities\/([a-z_]{1,40})$/;

const shellVersion = () => `${TERM_VERSION}-${APP_ENTRY.replace(/^.*entry-|\.js$/g, '')}`;

const PAGE = /^\/(t\/[a-z0-9][a-z0-9-]{0,62})?\/?$/;

type Owner = Caller & { readonly api: Coil };

type Admission = { readonly caller: Owner } | { readonly refused: Response };

const receiveUpload = async (request: Request, caller: Owner, name: string): Promise<Response> => {
  const file = new URL(request.url).searchParams.get('file') ?? '';
  const length = Number(request.headers.get('content-length') ?? 'NaN');

  if (!UPLOAD_NAME.test(file) || file.startsWith('.'))
    return Response.json(
      { error: 'file names are letters, digits, dot, dash, underscore' },
      { status: 400 },
    );

  if (!(length <= UPLOAD_LIMIT))
    return Response.json({ error: 'files are limited to 10 MB' }, { status: 413 });

  const bytes = await request.arrayBuffer();

  if (bytes.byteLength > UPLOAD_LIMIT)
    return Response.json({ error: 'files are limited to 10 MB' }, { status: 413 });

  try {
    const path = await caller.api.upload(name, `uploads/${file}`, bytes);

    return Response.json({ path });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);

    return Response.json(
      { error: reason },
      { status: reason.startsWith('unknown thread') ? 404 : 500 },
    );
  }
};

const bodyOf = async (request: Request): Promise<Record<string, unknown>> => {
  const text = await request.text();

  if (text.trim() === '') return {};

  const parsed: unknown = JSON.parse(text);

  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : {};
};

const runCapability = async (request: Request, caller: Owner, name: string): Promise<Response> => {
  const capability = capabilityNamed(name);

  if (capability === undefined)
    return Response.json({ error: `unknown capability ${name}` }, { status: 404 });

  try {
    return Response.json(await capability.run(caller.api, await bodyOf(request)));
  } catch (cause) {
    if (cause instanceof CapabilityInputError || cause instanceof SyntaxError)
      return Response.json({ error: cause.message }, { status: 400 });

    throw cause;
  }
};

const isLocalDev = (request: Request, env: Env) =>
  env.LOCAL_DEV_WITHOUT_ACCESS === '1' && LOCAL_HOSTS.has(new URL(request.url).hostname);

const admit = async (request: Request, env: Env): Promise<Admission> => {
  if (isLocalDev(request, env))
    return { caller: { who: LOCAL_OWNER, api: coil(env, LOCAL_OWNER) } };

  const result = await gate(request, env);

  return result.kind === 'response'
    ? { refused: result.response }
    : { caller: { who: result.identity.who, api: coil(env, result.identity.who) } };
};

const isCrossOriginWrite = (request: Request) => {
  const origin = request.headers.get('Origin');
  const isWrite = request.method !== 'GET' && request.method !== 'HEAD';

  return isWrite && origin !== null && origin !== new URL(request.url).origin;
};

const script = (body: string, cache: string) =>
  new Response(body, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': cache,
      'service-worker-allowed': '/',
    },
  });

const upgrade = (request: Request, caller: Owner, name: string, kind: SocketKind) =>
  request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
    ? caller.api.socket(name, kind, request)
    : Promise.resolve(new Response('Expected a WebSocket upgrade', { status: 426 }));

type SocketKind = 'terminal' | 'browser' | 'vnc';

const socketKind = (raw: string): SocketKind =>
  raw === 'browser' || raw === 'vnc' ? raw : 'terminal';

const failed = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  const status = /unknown thread|not found/i.test(message) ? 404 : 400;

  return Response.json({ error: message }, { status });
};

const route = async (request: Request, env: Env, caller: Owner): Promise<Response> => {
  const url = new URL(request.url);
  const { pathname } = url;

  if (isRpcPath(pathname)) return rpcHandler(caller)(request, Context.empty());

  if (pathname === '/mcp' && request.method === 'POST')
    return mcp(request, { env, who: caller.who, api: caller.api });

  const capability = CAPABILITY_PATH.exec(pathname);

  if (capability?.[1] !== undefined && request.method === 'POST')
    return runCapability(request, caller, capability[1]);

  if (pathname === `/assets/term-${TERM_VERSION}.js`)
    return script(TERM_JS, 'public, max-age=31536000, immutable');

  if (pathname === '/sw.js') return script(serviceWorker(shellVersion()), 'no-cache');

  const socket = THREAD_SOCKET.exec(pathname);

  if (socket?.[1] !== undefined && socket[2] !== undefined)
    return upgrade(request, caller, socket[1], socketKind(socket[2]));

  const upload = THREAD_UPLOAD.exec(pathname);

  if (upload?.[1] !== undefined && request.method === 'PUT')
    return receiveUpload(request, caller, upload[1]);

  const events = THREAD_EVENTS.exec(pathname);

  if (events?.[1] !== undefined) return caller.api.events(events[1], request);

  if (pathname.startsWith('/api/'))
    return (
      (await serveRest(request, handlersFor(caller))) ??
      Response.json({ error: 'not found' }, { status: 404 })
    );

  const shared = SHARED.exec(pathname);

  if (shared?.[1] !== undefined && request.method === 'GET') {
    const view = await sharedView(env, shared[1]);

    return view === null
      ? new Response('This link does not exist or was turned off.', { status: 404 })
      : new Response(sharedPage(view), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-robots-tag': 'noindex',
            'referrer-policy': 'no-referrer',
            'content-security-policy':
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'",
          },
        });
  }

  if (PAGE.test(pathname) && request.method === 'GET')
    return new Response(page(new URL(request.url).origin), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    });

  return env.ASSETS.fetch(request);
};

const PUBLIC_PAGES: Readonly<Record<string, (origin: string) => Response>> = {
  '/docs': (origin) =>
    new Response(docsPage(origin), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    }),
  '/player': (origin) =>
    new Response(playerPage(origin), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    }),
  '/robots.txt': (origin) =>
    new Response(robots(origin), {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
  '/sitemap.xml': (origin) =>
    new Response(sitemap(origin), {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    }),
  '/llms.txt': (origin) =>
    new Response(llmsText(origin), {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' },
    }),
};

const publicPage = (request: Request) => {
  const url = new URL(request.url);
  const page = PUBLIC_PAGES[url.pathname];

  return request.method === 'GET' && page !== undefined ? page(url.origin) : null;
};

const STATS_CACHE = 'public, max-age=60';

const statsRoute = async (request: Request, env: Env): Promise<Response | null> => {
  const url = new URL(request.url);

  if (request.method !== 'GET' || (url.pathname !== '/stats' && url.pathname !== '/stats.json'))
    return null;

  const stats = await env.DIRECTORY.getByName(DIRECTORY_NAME)
    .stats()
    .catch((cause: unknown) => {
      console.error('stats failed', cause instanceof Error ? cause.message : String(cause));

      return null;
    });

  if (stats === null)
    return new Response('Stats are not available right now.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' },
    });

  return url.pathname === '/stats.json'
    ? Response.json(stats, {
        headers: { 'cache-control': STATS_CACHE, 'access-control-allow-origin': '*' },
      })
    : new Response(statsPage(stats, url.origin), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': STATS_CACHE },
      });
};

const notFound = async (request: Request, env: Env): Promise<Response | null> => {
  const url = new URL(request.url);

  if (isKnownPath(url.pathname, PUBLIC_PAGES)) return null;

  const asset = await env.ASSETS.fetch(request);

  if (asset.status !== 404) return asset;

  return new Response(notFoundPage(url.origin, url.pathname), {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      'x-robots-tag': 'noindex',
    },
  });
};

export default {
  async fetch(request, env) {
    const open = publicPage(request);

    if (open !== null) return open;

    const stats = await statsRoute(request, env);

    if (stats !== null) return stats;

    const missing = await notFound(request, env);

    if (missing !== null) return missing;

    if (new URL(request.url).pathname === PLAYER_VIDEO && request.method === 'GET')
      return withRanges(request, await env.ASSETS.fetch(new URL(PLAYER_VIDEO, request.url)));

    const admission = await admit(request, env);

    if ('refused' in admission) return admission.refused;

    if (isCrossOriginWrite(request))
      return new Response('cross-origin request refused', { status: 403 });

    try {
      return await route(request, env, admission.caller);
    } catch (cause) {
      return failed(cause);
    }
  },
} satisfies ExportedHandler<Env>;
