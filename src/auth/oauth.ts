export const CLOUDFLARE_OAUTH = {
  authorize: 'https://dash.cloudflare.com/oauth2/auth',
  token: 'https://dash.cloudflare.com/oauth2/token',
  revoke: 'https://dash.cloudflare.com/oauth2/revoke',
  userinfo: 'https://dash.cloudflare.com/oauth2/userinfo',
  api: 'https://api.cloudflare.com/client/v4',
} as const;

export const SCOPES = [
  'offline_access',
  'user-details.read',
  'account-settings.read',
  'ai.read',
  'ai.write',
  'aig.read',
  'aig.run',
] as const;

export type OAuthClient = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
};

export type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
  readonly scope: string;
};

export class OAuthFailed extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

export const randomToken = (bytes = 32) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const pkceChallenge = async (verifier: string) =>
  base64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );

export const authorizeUrl = async (client: OAuthClient, state: string, verifier: string) => {
  const url = new URL(CLOUDFLARE_OAUTH.authorize);

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', client.clientId);
  url.searchParams.set('redirect_uri', client.redirectUri);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', await pkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
};

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;

const stringField = (value: unknown, key: string) => {
  const found = field(value, key);

  return typeof found === 'string' ? found : null;
};

const tokenRequest = async (
  client: OAuthClient,
  body: Record<string, string>,
  send: typeof fetch,
  now: number,
): Promise<TokenSet> => {
  const response = await send(CLOUDFLARE_OAUTH.token, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`,
    },
    body: new URLSearchParams(body).toString(),
  });
  const parsed: unknown = await response.json().catch(() => null);
  const accessToken = stringField(parsed, 'access_token');

  if (!response.ok || accessToken === null)
    throw new OAuthFailed(
      `Cloudflare refused the token request: ${stringField(parsed, 'error_description') ?? stringField(parsed, 'error') ?? response.status}`,
      response.status,
    );

  const expiresIn = field(parsed, 'expires_in');

  return {
    accessToken,
    refreshToken: stringField(parsed, 'refresh_token'),
    expiresAt: now + (typeof expiresIn === 'number' ? expiresIn : 3600) * 1000,
    scope: stringField(parsed, 'scope') ?? '',
  };
};

export const exchangeCode = (
  client: OAuthClient,
  code: string,
  verifier: string,
  send: typeof fetch = fetch,
  now = Date.now(),
) =>
  tokenRequest(
    client,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: client.redirectUri,
      code_verifier: verifier,
    },
    send,
    now,
  );

export const refreshTokens = (
  client: OAuthClient,
  refreshToken: string,
  send: typeof fetch = fetch,
  now = Date.now(),
) => tokenRequest(client, { grant_type: 'refresh_token', refresh_token: refreshToken }, send, now);

export type CloudflareUser = {
  readonly sub: string;
  readonly email: string | null;
};

export const userInfo = async (
  accessToken: string,
  send: typeof fetch = fetch,
): Promise<CloudflareUser> => {
  const response = await send(CLOUDFLARE_OAUTH.userinfo, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const parsed: unknown = await response.json().catch(() => null);
  const sub = stringField(parsed, 'sub');

  if (!response.ok || sub === null)
    throw new OAuthFailed(`Cloudflare userinfo failed: ${response.status}`);

  return { sub, email: stringField(parsed, 'email') };
};

export type CloudflareAccount = { readonly id: string; readonly name: string };

export const accountsOf = async (
  accessToken: string,
  send: typeof fetch = fetch,
): Promise<CloudflareAccount[]> => {
  const response = await send(`${CLOUDFLARE_OAUTH.api}/accounts?per_page=50`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const parsed: unknown = await response.json().catch(() => null);
  const result = field(parsed, 'result');

  if (!response.ok || !Array.isArray(result))
    throw new OAuthFailed(`Cloudflare accounts failed: ${response.status}`);

  return result.flatMap((item: unknown) => {
    const id = stringField(item, 'id');
    const name = stringField(item, 'name');

    return id === null ? [] : [{ id, name: name ?? id }];
  });
};

export type AccountGateway = { readonly id: string; readonly authenticated: boolean };

export type GatewayListing = {
  readonly gateways: AccountGateway[];
  readonly problem: string | null;
};

const listingProblem = (status: number, parsed: unknown): string => {
  const errors = field(parsed, 'errors');
  const first = Array.isArray(errors) ? stringField(errors[0], 'message') : null;

  return `Cloudflare returned ${status}${first === null ? '' : `: ${first}`}`;
};

export const listGateways = async (
  accessToken: string,
  accountId: string,
  send: typeof fetch = fetch,
): Promise<GatewayListing> => {
  if (accountId === '')
    return { gateways: [], problem: 'This sign-in has no account. Sign out and sign in again.' };

  const response = await send(
    `${CLOUDFLARE_OAUTH.api}/accounts/${encodeURIComponent(accountId)}/ai-gateway/gateways?per_page=50`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const parsed: unknown = await response.json().catch(() => null);
  const result = field(parsed, 'result');

  if (!response.ok || !Array.isArray(result))
    return { gateways: [], problem: listingProblem(response.status, parsed) };

  return {
    gateways: result.flatMap((item: unknown) => {
      const id = stringField(item, 'id');

      return id === null ? [] : [{ id, authenticated: field(item, 'authentication') === true }];
    }),
    problem: null,
  };
};

export const gatewaysOf = async (
  accessToken: string,
  accountId: string,
  send: typeof fetch = fetch,
): Promise<AccountGateway[]> => (await listGateways(accessToken, accountId, send)).gateways;

export const pickGateway = (
  gateways: readonly AccountGateway[],
  preferred: string | undefined,
): string | null => {
  const usable = gateways.filter((gateway) => gateway.authenticated);
  const named = (id: string | undefined) => usable.find((gateway) => gateway.id === id)?.id;

  return named(preferred) ?? named('default') ?? usable[0]?.id ?? null;
};

export const revoke = async (client: OAuthClient, token: string, send: typeof fetch = fetch) => {
  await send(CLOUDFLARE_OAUTH.revoke, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`,
    },
    body: new URLSearchParams({ token }).toString(),
  }).catch(() => undefined);
};
