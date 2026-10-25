import type { Connector } from './config';

export type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
};

export class ConnectorAuthFailed extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

export const randomToken = (bytes = 32): string =>
  base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const challengeFor = async (verifier: string): Promise<string> =>
  base64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );

export const callbackUrl = (origin: string, connector: Connector): string =>
  `${origin}/connectors/${connector.id}/callback`;

const failure = async (what: string, response: Response) =>
  new ConnectorAuthFailed(
    `${what} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`,
    response.status,
  );

export const registerClient = async (
  connector: Connector,
  redirectUri: string,
  send: typeof fetch,
): Promise<string> => {
  const response = await send(connector.auth.registrationEndpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'coil',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  if (!response.ok) throw await failure('client registration', response);

  const body: unknown = await response.json();
  const clientId =
    typeof body === 'object' && body !== null && 'client_id' in body ? body.client_id : null;

  if (typeof clientId !== 'string' || clientId === '')
    throw new ConnectorAuthFailed('client registration returned no client_id', 502);

  return clientId;
};

export const authorizationUrl = (
  connector: Connector,
  input: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly state: string;
    readonly challenge: string;
  },
): string => {
  const url = new URL(connector.auth.authorizationEndpoint);

  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    resource: connector.auth.resource,
  }).toString();

  return url.toString();
};

const tokensFrom = (body: unknown, now: number, previous: string | null): TokenSet => {
  const value =
    typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body)) : {};
  const accessToken = value.access_token;
  const expiresIn = typeof value.expires_in === 'number' ? value.expires_in : 900;

  if (typeof accessToken !== 'string' || accessToken === '')
    throw new ConnectorAuthFailed('the token answer has no access_token', 502);

  return {
    accessToken,
    refreshToken: typeof value.refresh_token === 'string' ? value.refresh_token : previous,
    expiresAt: now + expiresIn * 1000,
  };
};

const tokenCall = async (
  connector: Connector,
  form: Record<string, string>,
  send: typeof fetch,
  what: string,
  previous: string | null,
): Promise<TokenSet> => {
  const response = await send(connector.auth.tokenEndpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...form, resource: connector.auth.resource }),
  });

  if (!response.ok) throw await failure(what, response);

  return tokensFrom(await response.json(), Date.now(), previous);
};

export const exchangeCode = (
  connector: Connector,
  input: {
    readonly clientId: string;
    readonly code: string;
    readonly verifier: string;
    readonly redirectUri: string;
  },
  send: typeof fetch,
): Promise<TokenSet> =>
  tokenCall(
    connector,
    {
      grant_type: 'authorization_code',
      code: input.code,
      client_id: input.clientId,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
    },
    send,
    'token exchange',
    null,
  );

export const refreshTokens = (
  connector: Connector,
  clientId: string,
  refreshToken: string,
  send: typeof fetch,
): Promise<TokenSet> =>
  tokenCall(
    connector,
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId },
    send,
    'token refresh',
    refreshToken,
  );

export const isRevoked = (cause: unknown): boolean =>
  cause instanceof ConnectorAuthFailed && [400, 401, 403].includes(cause.status);
