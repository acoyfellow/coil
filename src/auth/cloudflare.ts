import type { Directory } from '../directory';
import { DIRECTORY_NAME } from '../directory-name';
import { gatewayPage } from './gateway-page';
import {
  accountsOf,
  authorizeUrl,
  exchangeCode,
  gatewaysOf,
  listGateways,
  type OAuthClient,
  OAuthFailed,
  pickGateway,
  randomToken,
  revoke,
  userInfo,
} from './oauth';
import { refreshedToken, SignedOut, TOKEN_REFRESH_MARGIN_MS } from './refresh';
import {
  clearCookie,
  cookie,
  cookieJar,
  FLOW_TTL_MS,
  parseSession,
  readCookie,
  SESSION_TTL_MS,
  sessionValue,
  sign,
  unsign,
} from './session';
import { signInPage } from './sign-in-page';
import { type Auth, CLOUDFLARE_OWNER_PREFIX } from './types';

export type CloudflareAuthEnv = {
  readonly DIRECTORY: DurableObjectNamespace<Directory>;
  readonly OAUTH_CLIENT_ID?: string;
  readonly OAUTH_CLIENT_SECRET?: string;
  readonly SESSION_SECRET?: string;
  readonly COIL_USER_GATEWAY?: string;
};

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });

const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ location, 'cache-control': 'no-store' });

  for (const each of cookies) headers.append('set-cookie', each);

  return new Response(null, { status: 302, headers });
};

const wantsJson = (request: Request) => {
  const path = new URL(request.url).pathname;

  return path.startsWith('/api/') || path === '/mcp' || path === '/llms.txt';
};

type Flow = {
  readonly state: string;
  readonly verifier: string;
  readonly expires: number;
  readonly back: string;
};

const SAFE_RETURN = /^\/t\/[a-z0-9-]{1,80}$/;

export const safeReturn = (raw: string | null | undefined): string =>
  raw !== null && raw !== undefined && SAFE_RETURN.test(raw) ? raw : '/';

const parseFlow = (raw: string | null, now = Date.now()): Flow | null => {
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('state' in parsed) ||
      !('verifier' in parsed) ||
      !('expires' in parsed)
    )
      return null;

    const { state, verifier, expires } = parsed;
    const back =
      'back' in parsed && typeof parsed.back === 'string' ? safeReturn(parsed.back) : '/';

    return typeof state === 'string' &&
      typeof verifier === 'string' &&
      typeof expires === 'number' &&
      expires > now
      ? { state, verifier, expires, back }
      : null;
  } catch {
    return null;
  }
};

export const cloudflareAuth = (env: CloudflareAuthEnv, send: typeof fetch = fetch): Auth => {
  const directory = () => env.DIRECTORY.getByName(DIRECTORY_NAME);
  const secret = env.SESSION_SECRET ?? '';
  const ready =
    (env.OAUTH_CLIENT_ID ?? '') !== '' &&
    (env.OAUTH_CLIENT_SECRET ?? '') !== '' &&
    secret.length >= 32;

  const clientFor = (request: Request): OAuthClient => ({
    clientId: env.OAUTH_CLIENT_ID ?? '',
    clientSecret: env.OAUTH_CLIENT_SECRET ?? '',
    redirectUri: `${new URL(request.url).origin}/oauth/callback`,
  });

  const page = (request: Request, error: string | undefined, status: number) => {
    const jar = cookieJar(request.url);

    return html(
      signInPage({
        origin: new URL(request.url).origin,
        ...(error === undefined ? {} : { error }),
      }),
      status,
      {
        'set-cookie': clearCookie(jar, jar.flow),
      },
    );
  };

  const notReady = (request: Request) =>
    page(request, 'Sign in with Cloudflare is not configured on this instance yet.', 503);

  const login = async (request: Request) => {
    if (!ready) return notReady(request);

    const flow: Flow = {
      state: randomToken(),
      verifier: randomToken(48),
      expires: Date.now() + FLOW_TTL_MS,
      back: safeReturn(new URL(request.url).searchParams.get('return')),
    };

    const jar = cookieJar(request.url);

    return redirect(await authorizeUrl(clientFor(request), flow.state, flow.verifier), [
      cookie(jar, jar.flow, await sign(secret, JSON.stringify(flow)), FLOW_TTL_MS),
    ]);
  };

  const callback = async (request: Request) => {
    if (!ready) return notReady(request);

    const url = new URL(request.url);
    const jar = cookieJar(request.url);
    const denied = url.searchParams.get('error');

    if (denied !== null)
      return page(
        request,
        `Cloudflare did not sign you in: ${url.searchParams.get('error_description') ?? denied}`,
        400,
      );

    const flow = parseFlow(await unsign(secret, readCookie(request, jar.flow)));
    const code = url.searchParams.get('code');

    if (flow === null || code === null || url.searchParams.get('state') !== flow.state)
      return page(request, 'That sign-in link expired or did not start here. Try again.', 400);

    try {
      const client = clientFor(request);
      const tokens = await exchangeCode(client, code, flow.verifier, send);
      const user = await userInfo(tokens.accessToken, send);
      const [account] = await accountsOf(tokens.accessToken, send);

      if (account === undefined)
        return page(
          request,
          'You did not give coil access to any Cloudflare account. Sign in again and pick one.',
          403,
        );

      const gateways = await gatewaysOf(tokens.accessToken, account.id, send);
      const gateway = pickGateway(gateways, env.COIL_USER_GATEWAY);
      const shouldChoose = gateways.filter((each) => each.authenticated).length > 1;

      if (gateway === null)
        return page(
          request,
          `${account.name} has no AI Gateway with authentication turned on. Turn on authentication for a gateway in the Cloudflare dashboard, then sign in again.`,
          403,
        );

      const owner = `${CLOUDFLARE_OWNER_PREFIX}${user.sub}`;
      const session = { owner, id: randomToken(), expires: Date.now() + SESSION_TTL_MS };

      await directory().saveGrant({
        owner,
        email: user.email,
        accountId: account.id,
        accountName: account.name,
        gateway,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
      });
      await directory().openSession(session.id, owner, session.expires);

      return redirect(
        shouldChoose ? `/oauth/gateway?return=${encodeURIComponent(flow.back)}` : flow.back,
        [
          clearCookie(jar, jar.flow),
          cookie(jar, jar.session, await sign(secret, sessionValue(session)), SESSION_TTL_MS),
        ],
      );
    } catch (cause) {
      if (cause instanceof OAuthFailed) return page(request, cause.message, 502);

      throw cause;
    }
  };

  const sessionOf = async (request: Request) => {
    if (!ready) return null;

    const session = parseSession(
      await unsign(secret, readCookie(request, cookieJar(request.url).session)),
    );

    if (session === null) return null;

    return (await directory().sessionOwner(session.id)) === session.owner ? session : null;
  };

  const logout = async (request: Request) => {
    const session = await sessionOf(request);

    if (session !== null) {
      const grant = await directory().grantFor(session.owner);

      await directory().closeSession(session.id);

      if (grant !== null) {
        await revoke(clientFor(request), grant.refreshToken ?? grant.accessToken, send);
        await directory().dropGrant(session.owner);
      }
    }

    const jar = cookieJar(request.url);

    return redirect('/', [clearCookie(jar, jar.session)]);
  };

  const me = async (request: Request) => {
    const session = await sessionOf(request);

    if (session === null) return Response.json({ signedIn: false }, { status: 401 });

    const grant = await directory().grantFor(session.owner);

    return Response.json({
      signedIn: true,
      email: grant?.email ?? null,
      account: grant?.accountName ?? null,
      gateway: grant?.gateway ?? null,
    });
  };

  const freshToken = async (owner: string) => {
    const grant = await directory().grantFor(owner);

    if (grant === null) return null;

    if (grant.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS)
      return { grant, token: grant.accessToken };

    return { grant, token: await refreshedToken(env, grant, directory(), send) };
  };

  const gatewayChoice = async (request: Request) => {
    const session = await sessionOf(request);

    if (session === null) return redirect('/');

    const fresh = await freshToken(session.owner).catch((cause) => {
      if (cause instanceof SignedOut) return null;
      throw cause;
    });

    if (fresh === null) return redirect('/');

    const { gateways, problem } = await listGateways(fresh.token, fresh.grant.accountId, send);
    if (problem !== null) console.warn('gateway list failed', { problem });
    const back = safeReturn(new URL(request.url).searchParams.get('return'));
    const view = (error?: string, current = fresh.grant.gateway, status = 200) =>
      html(
        gatewayPage({
          accountName: fresh.grant.accountName,
          back,
          current,
          gateways,
          problem,
          ...(error === undefined ? {} : { error }),
        }),
        status,
      );

    if (request.method === 'GET') return view();

    if (request.headers.get('origin') !== new URL(request.url).origin)
      return new Response('cross-origin request refused', { status: 403 });

    const chosen = String((await request.formData()).get('gateway') ?? '');
    const usable = gateways.some((each) => each.id === chosen && each.authenticated);

    if (!usable)
      return view('Pick a gateway that has authentication turned on.', fresh.grant.gateway, 400);

    await directory().saveGrant({ ...fresh.grant, gateway: chosen });

    return redirect(back);
  };

  return {
    mode: 'cloudflare',
    routes: async (request) => {
      const { pathname } = new URL(request.url);

      if (pathname === '/oauth/login' && request.method === 'GET') return login(request);

      if (pathname === '/oauth/callback' && request.method === 'GET') return callback(request);

      if (pathname === '/oauth/logout' && request.method === 'POST') return logout(request);

      if (pathname === '/oauth/me' && request.method === 'GET') return me(request);

      if (pathname === '/oauth/gateway' && (request.method === 'GET' || request.method === 'POST'))
        return gatewayChoice(request);

      return null;
    },
    admit: async (request) => {
      const session = await sessionOf(request);

      if (session !== null) return { identity: { who: session.owner } };

      if (wantsJson(request))
        return {
          refused: Response.json(
            { error: 'sign in with Cloudflare first', login: '/oauth/login' },
            { status: 401 },
          ),
        };

      const asked = new URL(request.url);

      return {
        refused: html(
          signInPage({ origin: asked.origin, back: safeReturn(asked.pathname) }),
          ready ? 200 : 503,
        ),
      };
    },
  };
};
