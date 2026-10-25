import { DurableObject } from 'cloudflare:workers';
import { type ConnectorEnv, connectorNamed } from './config';
import {
  authorizationUrl,
  callbackUrl,
  challengeFor,
  exchangeCode,
  isRevoked,
  randomToken,
  refreshTokens,
  registerClient,
} from './oauth';
import { seal, unseal } from './seal';

const PENDING_TTL_MS = 10 * 60_000;
const REFRESH_MARGIN_MS = 2 * 60_000;

export type ConnectorStatus = {
  readonly id: string;
  readonly description: string;
  readonly connected: boolean;
};

export type StartedSignIn = { readonly url: string };

export type FinishedSignIn =
  | { readonly ok: true; readonly back: string }
  | { readonly ok: false; readonly reason: string };

export type StoreEnv = ConnectorEnv;

type PendingRow = {
  connector: string;
  client_id: string;
  verifier: string;
  redirect_uri: string;
  back: string;
  expires_at: number;
};

type TokenRow = {
  client_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
};

export class ConnectorStore extends DurableObject<StoreEnv> {
  protected send: typeof fetch = (input, init) => fetch(input, init);

  private refreshing = new Map<string, Promise<string | null>>();

  constructor(ctx: DurableObjectState, env: StoreEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS pending (state TEXT PRIMARY KEY, connector TEXT NOT NULL, client_id TEXT NOT NULL, verifier TEXT NOT NULL, redirect_uri TEXT NOT NULL, back TEXT NOT NULL, expires_at INTEGER NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS tokens (connector TEXT PRIMARY KEY, client_id TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER NOT NULL)',
    );
  }

  private get owner(): string {
    return this.ctx.id.name ?? this.ctx.id.toString();
  }

  private tokenRow(connector: string): TokenRow | null {
    return (
      this.ctx.storage.sql
        .exec<TokenRow>(
          'SELECT client_id, access_token, refresh_token, expires_at FROM tokens WHERE connector = ?',
          connector,
        )
        .toArray()[0] ?? null
    );
  }

  status(): ConnectorStatus[] {
    return this.ctx.storage.sql
      .exec<{ connector: string }>('SELECT connector FROM tokens')
      .toArray()
      .map((row) => ({ id: row.connector, description: '', connected: true }));
  }

  async start(connectorId: string, origin: string, back: string): Promise<StartedSignIn> {
    const connector = connectorNamed(this.env, connectorId);

    if (connector === null) throw new Error(`unknown connector ${connectorId}`);

    const redirectUri = callbackUrl(origin, connector);
    const clientId = await registerClient(connector, redirectUri, this.send);
    const state = randomToken();
    const verifier = randomToken();

    this.ctx.storage.sql.exec('DELETE FROM pending WHERE expires_at < ?', Date.now());
    this.ctx.storage.sql.exec(
      'INSERT INTO pending (state, connector, client_id, verifier, redirect_uri, back, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      state,
      connector.id,
      clientId,
      await seal(this.env.CONNECTOR_SEAL_KEY, this.owner, verifier),
      redirectUri,
      back,
      Date.now() + PENDING_TTL_MS,
    );

    return {
      url: authorizationUrl(connector, {
        clientId,
        redirectUri,
        state,
        challenge: await challengeFor(verifier),
      }),
    };
  }

  async finish(connectorId: string, state: string, code: string): Promise<FinishedSignIn> {
    const pending = this.ctx.storage.sql
      .exec<PendingRow>('SELECT * FROM pending WHERE state = ?', state)
      .toArray()[0];

    this.ctx.storage.sql.exec('DELETE FROM pending WHERE state = ?', state);

    if (
      pending === undefined ||
      pending.connector !== connectorId ||
      pending.expires_at < Date.now()
    )
      return { ok: false, reason: 'This sign-in link expired or was already used. Start again.' };

    const connector = connectorNamed(this.env, connectorId);

    if (connector === null) return { ok: false, reason: `unknown connector ${connectorId}` };

    const tokens = await exchangeCode(
      connector,
      {
        clientId: pending.client_id,
        code,
        verifier: await unseal(this.env.CONNECTOR_SEAL_KEY, this.owner, pending.verifier),
        redirectUri: pending.redirect_uri,
      },
      this.send,
    );

    await this.saveTokens(connector.id, pending.client_id, tokens);

    return { ok: true, back: pending.back };
  }

  disconnect(connectorId: string): void {
    this.ctx.storage.sql.exec('DELETE FROM tokens WHERE connector = ?', connectorId);
  }

  async accessToken(connectorId: string): Promise<string | null> {
    const row = this.tokenRow(connectorId);

    if (row === null) return null;

    if (row.expires_at > Date.now() + REFRESH_MARGIN_MS)
      return unseal(this.env.CONNECTOR_SEAL_KEY, this.owner, row.access_token);

    const running = this.refreshing.get(connectorId);

    if (running !== undefined) return running;

    const started = this.refresh(connectorId, row).finally(() =>
      this.refreshing.delete(connectorId),
    );

    this.refreshing.set(connectorId, started);

    return started;
  }

  async rejected(connectorId: string): Promise<string | null> {
    const row = this.tokenRow(connectorId);

    if (row === null) return null;

    this.ctx.storage.sql.exec('UPDATE tokens SET expires_at = 0 WHERE connector = ?', connectorId);

    return this.accessToken(connectorId);
  }

  private async refresh(connectorId: string, row: TokenRow): Promise<string | null> {
    const connector = connectorNamed(this.env, connectorId);

    if (connector === null || row.refresh_token === null) {
      this.disconnect(connectorId);

      return null;
    }

    try {
      const tokens = await refreshTokens(
        connector,
        row.client_id,
        await unseal(this.env.CONNECTOR_SEAL_KEY, this.owner, row.refresh_token),
        this.send,
      );

      await this.saveTokens(connectorId, row.client_id, tokens);

      return tokens.accessToken;
    } catch (cause) {
      console.warn('connector refresh failed', {
        connector: connectorId,
        reason: cause instanceof Error ? cause.message : String(cause),
      });

      if (isRevoked(cause)) this.disconnect(connectorId);

      return null;
    }
  }

  private async saveTokens(
    connectorId: string,
    clientId: string,
    tokens: { accessToken: string; refreshToken: string | null; expiresAt: number },
  ) {
    const key = this.env.CONNECTOR_SEAL_KEY;

    this.ctx.storage.sql.exec(
      'INSERT INTO tokens (connector, client_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(connector) DO UPDATE SET client_id = excluded.client_id, access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at',
      connectorId,
      clientId,
      await seal(key, this.owner, tokens.accessToken),
      tokens.refreshToken === null ? null : await seal(key, this.owner, tokens.refreshToken),
      tokens.expiresAt,
    );
  }
}
