import type { Directory } from '../directory';
import { OAuthFailed, refreshTokens } from './oauth';

export const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

export class SignedOut extends Error {}

export type RefreshEnv = {
  readonly OAUTH_CLIENT_ID?: string;
  readonly OAUTH_CLIENT_SECRET?: string;
};

export type OAuthClientCredentials = { readonly clientId: string; readonly clientSecret: string };

export type AccountToken = {
  readonly token: string;
  readonly accountId: string;
  readonly gateway: string;
};

export type TokenOutcome =
  | ({ readonly _tag: 'Ready' } & AccountToken)
  | { readonly _tag: 'SignedOut'; readonly reason: string }
  | { readonly _tag: 'Unavailable'; readonly reason: string };

export const SIGNED_OUT_REASON = 'Your Cloudflare sign-in expired. Sign in with Cloudflare again.';

export const UNAVAILABLE_REASON =
  'Cloudflare did not answer the token refresh. Try again in a moment.';

const REVOKED_STATUSES: ReadonlySet<number> = new Set([400, 401, 403]);

export const isRevoked = (cause: unknown): boolean =>
  cause instanceof OAuthFailed && REVOKED_STATUSES.has(cause.status);

export const credentialsOf = (env: RefreshEnv): OAuthClientCredentials => ({
  clientId: env.OAUTH_CLIENT_ID ?? '',
  clientSecret: env.OAUTH_CLIENT_SECRET ?? '',
});

export const refreshWith = (
  credentials: OAuthClientCredentials,
  refreshToken: string,
  send: typeof fetch = fetch,
) => refreshTokens({ ...credentials, redirectUri: '' }, refreshToken, send);

export const tokenOrThrow = (outcome: TokenOutcome): AccountToken => {
  if (outcome._tag === 'Ready')
    return { token: outcome.token, accountId: outcome.accountId, gateway: outcome.gateway };

  throw new SignedOut(outcome.reason);
};

export const replacedToken = async (
  env: RefreshEnv,
  owner: string,
  rejected: string,
  directory: DurableObjectStub<Directory>,
): Promise<AccountToken> =>
  tokenOrThrow(await directory.replaceToken(owner, rejected, credentialsOf(env)));

export const accountToken = async (
  env: RefreshEnv,
  owner: string,
  directory: DurableObjectStub<Directory>,
): Promise<AccountToken> => tokenOrThrow(await directory.freshToken(owner, credentialsOf(env)));
