import { DurableObject } from 'cloudflare:workers';
import { parseStoredEntries, type StoredCatalog } from './catalog';

export type ThreadSummary = {
  readonly name: string;
  readonly title: string;
  readonly phase: string;
  readonly busy: boolean;
  readonly repo: string | null;
  readonly parent: string | null;
  readonly forkedFrom: string | null;
  readonly createdBy: string;
  readonly owner: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived: boolean;
  readonly model: string;
  readonly spend: number;
  readonly looping: boolean;
  readonly failed?: boolean;
  readonly pinned?: boolean;
};

export type ThreadUpdate = Partial<Omit<ThreadSummary, 'name' | 'createdAt'>> & {
  readonly name: string;
};

type Row = {
  name: string;
  title: string;
  phase: string;
  busy: number;
  repo: string | null;
  parent: string | null;
  forked_from: string | null;
  created_by: string;
  owner: string;
  created_at: number;
  updated_at: number;
  archived: number;
  model: string;
  spend: number;
  looping: number;
  failed: number;
  pinned: number;
};

const fromRow = (row: Row): ThreadSummary => ({
  name: row.name,
  title: row.title,
  phase: row.phase,
  busy: row.busy === 1,
  repo: row.repo,
  parent: row.parent,
  forkedFrom: row.forked_from,
  createdBy: row.created_by,
  owner: row.owner,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  archived: row.archived === 1,
  model: row.model,
  spend: row.spend,
  looping: row.looping === 1,
  failed: row.failed === 1,
  pinned: row.pinned === 1,
});

import {
  isRevoked,
  type OAuthClientCredentials,
  refreshWith,
  SIGNED_OUT_REASON,
  TOKEN_REFRESH_MARGIN_MS,
  type TokenOutcome,
  UNAVAILABLE_REASON,
} from './auth/refresh';
import {
  DAY_MS,
  type InstanceStats,
  lastDays,
  modelLabel,
  STATS_DAYS,
  sourceOf,
  topCounts,
} from './stats';

const REFRESH_ATTEMPTS = 3;
const REFRESH_BACKOFF_MS = 400;

export const TURN_RESERVE = 0.5;

export type Grant = {
  readonly owner: string;
  readonly email: string | null;
  readonly accountId: string;
  readonly accountName: string;
  readonly gateway: string;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
  readonly scope: string;
};

export class Directory extends DurableObject {
  protected send: typeof fetch = (input, init) => fetch(input, init);

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS threads (name TEXT PRIMARY KEY, title TEXT NOT NULL, phase TEXT NOT NULL, busy INTEGER NOT NULL DEFAULT 0, repo TEXT, parent TEXT, forked_from TEXT, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS limits (owner TEXT PRIMARY KEY, dollars REAL NOT NULL)`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS bases (repo TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, thread TEXT NOT NULL, setup TEXT NOT NULL, at INTEGER NOT NULL)`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS grants (owner TEXT PRIMARY KEY, email TEXT, account_id TEXT NOT NULL, account_name TEXT NOT NULL, gateway TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER NOT NULL, scope TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS catalogs (account_id TEXT PRIMARY KEY, entries TEXT NOT NULL, fetched_at INTEGER NOT NULL)`,
    );
    this.migrate();
  }

  saveGrant(grant: Grant): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO grants (owner, email, account_id, account_name, gateway, access_token, refresh_token, expires_at, scope, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner) DO UPDATE SET email = excluded.email, account_id = excluded.account_id, account_name = excluded.account_name, gateway = excluded.gateway, access_token = excluded.access_token, refresh_token = COALESCE(excluded.refresh_token, grants.refresh_token), expires_at = excluded.expires_at, scope = excluded.scope, updated_at = excluded.updated_at`,
      grant.owner,
      grant.email,
      grant.accountId,
      grant.accountName,
      grant.gateway,
      grant.accessToken,
      grant.refreshToken,
      grant.expiresAt,
      grant.scope,
      Date.now(),
    );
  }

  catalogFor(accountId: string): StoredCatalog | null {
    const row = this.ctx.storage.sql
      .exec<{ entries: string; fetched_at: number }>(
        'SELECT entries, fetched_at FROM catalogs WHERE account_id = ?',
        accountId,
      )
      .toArray()[0];

    return row === undefined
      ? null
      : { entries: parseStoredEntries(row.entries), fetchedAt: row.fetched_at };
  }

  saveCatalog(accountId: string, catalog: StoredCatalog): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO catalogs (account_id, entries, fetched_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET entries = excluded.entries, fetched_at = excluded.fetched_at',
      accountId,
      JSON.stringify(catalog.entries),
      catalog.fetchedAt,
    );
  }

  grantFor(owner: string): Grant | null {
    const row = this.ctx.storage.sql
      .exec<{
        owner: string;
        email: string | null;
        account_id: string;
        account_name: string;
        gateway: string;
        access_token: string;
        refresh_token: string | null;
        expires_at: number;
        scope: string;
      }>('SELECT * FROM grants WHERE owner = ?', owner)
      .toArray()[0];

    return row === undefined
      ? null
      : {
          owner: row.owner,
          email: row.email,
          accountId: row.account_id,
          accountName: row.account_name,
          gateway: row.gateway,
          accessToken: row.access_token,
          refreshToken: row.refresh_token,
          expiresAt: row.expires_at,
          scope: row.scope,
        };
  }

  private refreshing = new Map<string, Promise<TokenOutcome>>();

  freshToken(
    owner: string,
    credentials: OAuthClientCredentials,
    now = Date.now(),
  ): Promise<TokenOutcome> {
    const grant = this.grantFor(owner);

    if (grant === null) return Promise.resolve({ _tag: 'SignedOut', reason: SIGNED_OUT_REASON });

    if (grant.expiresAt > now + TOKEN_REFRESH_MARGIN_MS)
      return Promise.resolve({
        _tag: 'Ready',
        token: grant.accessToken,
        accountId: grant.accountId,
        gateway: grant.gateway,
      });

    const running = this.refreshing.get(owner);

    if (running !== undefined) return running;

    const started = this.refreshGrant(grant, credentials).finally(() =>
      this.refreshing.delete(owner),
    );

    this.refreshing.set(owner, started);

    return started;
  }

  replaceToken(
    owner: string,
    rejected: string,
    credentials: OAuthClientCredentials,
  ): Promise<TokenOutcome> {
    const grant = this.grantFor(owner);

    if (grant === null) return Promise.resolve({ _tag: 'SignedOut', reason: SIGNED_OUT_REASON });

    if (grant.accessToken !== rejected) return this.freshToken(owner, credentials);

    this.saveGrant({ ...grant, expiresAt: 0 });

    return this.freshToken(owner, credentials);
  }

  private async refreshGrant(
    grant: Grant,
    credentials: OAuthClientCredentials,
  ): Promise<TokenOutcome> {
    if (grant.refreshToken === null) {
      this.dropGrant(grant.owner);

      return { _tag: 'SignedOut', reason: SIGNED_OUT_REASON };
    }

    for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt += 1) {
      try {
        const tokens = await refreshWith(credentials, grant.refreshToken, this.send);
        const latest = this.grantFor(grant.owner) ?? grant;

        this.saveGrant({
          ...latest,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? grant.refreshToken,
          expiresAt: tokens.expiresAt,
          scope: tokens.scope === '' ? latest.scope : tokens.scope,
        });

        return {
          _tag: 'Ready',
          token: tokens.accessToken,
          accountId: latest.accountId,
          gateway: latest.gateway,
        };
      } catch (cause) {
        if (isRevoked(cause)) {
          console.warn('cloudflare refresh revoked', {
            reason: cause instanceof Error ? cause.message : String(cause),
          });
          this.dropGrant(grant.owner);

          return { _tag: 'SignedOut', reason: SIGNED_OUT_REASON };
        }

        console.warn('cloudflare refresh failed', {
          attempt,
          reason: cause instanceof Error ? cause.message : String(cause),
        });
        if (attempt < REFRESH_ATTEMPTS)
          await new Promise((resolve) => setTimeout(resolve, REFRESH_BACKOFF_MS * attempt));
      }
    }

    return { _tag: 'Unavailable', reason: UNAVAILABLE_REASON };
  }

  dropGrant(owner: string): void {
    this.ctx.storage.sql.exec('DELETE FROM grants WHERE owner = ?', owner);
    this.ctx.storage.sql.exec('DELETE FROM sessions WHERE owner = ?', owner);
  }

  openSession(id: string, owner: string, expiresAt: number): void {
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO sessions (id, owner, expires_at) VALUES (?, ?, ?)',
      id,
      owner,
      expiresAt,
    );
  }

  sessionOwner(id: string): string | null {
    return (
      this.ctx.storage.sql
        .exec<{ owner: string }>(
          'SELECT owner FROM sessions WHERE id = ? AND expires_at > ?',
          id,
          Date.now(),
        )
        .toArray()[0]?.owner ?? null
    );
  }

  closeSession(id: string): void {
    this.ctx.storage.sql.exec('DELETE FROM sessions WHERE id = ?', id);
  }

  private migrate() {
    const columns = this.ctx.storage.sql
      .exec<{ name: string }>('PRAGMA table_info(threads)')
      .toArray()
      .map((c) => c.name);

    if (!columns.includes('owner'))
      this.ctx.storage.sql.exec(`ALTER TABLE threads ADD COLUMN owner TEXT NOT NULL DEFAULT ''`);
    if (!columns.includes('archived'))
      this.ctx.storage.sql.exec(
        `ALTER TABLE threads ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`,
      );
    if (!columns.includes('model'))
      this.ctx.storage.sql.exec(`ALTER TABLE threads ADD COLUMN model TEXT NOT NULL DEFAULT ''`);
    if (!columns.includes('looping'))
      this.ctx.storage.sql.exec(
        `ALTER TABLE threads ADD COLUMN looping INTEGER NOT NULL DEFAULT 0`,
      );
    if (!columns.includes('spend'))
      this.ctx.storage.sql.exec(`ALTER TABLE threads ADD COLUMN spend REAL NOT NULL DEFAULT 0`);
    if (!columns.includes('pinned'))
      this.ctx.storage.sql.exec(`ALTER TABLE threads ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
    if (!columns.includes('failed'))
      this.ctx.storage.sql.exec(`ALTER TABLE threads ADD COLUMN failed INTEGER NOT NULL DEFAULT 0`);
  }

  upsert(update: ThreadUpdate): void {
    const now = Date.now();
    const current = this.get(update.name);
    const next = {
      title: update.title ?? current?.title ?? update.name,
      phase: update.phase ?? current?.phase ?? 'new',
      busy: (update.busy ?? current?.busy ?? false) ? 1 : 0,
      repo: update.repo ?? current?.repo ?? null,
      parent: update.parent ?? current?.parent ?? null,
      forkedFrom: update.forkedFrom ?? current?.forkedFrom ?? null,
      createdBy: update.createdBy ?? current?.createdBy ?? 'api',
      owner: current?.owner || update.owner || '',
      archived: (update.archived ?? current?.archived ?? false) ? 1 : 0,
      model: update.model ?? current?.model ?? '',
      spend: update.spend ?? current?.spend ?? 0,
      looping: (update.looping ?? current?.looping ?? false) ? 1 : 0,
      failed: (update.failed ?? current?.failed ?? false) ? 1 : 0,
      pinned: (update.pinned ?? current?.pinned ?? false) ? 1 : 0,
    };

    this.ctx.storage.sql.exec(
      `INSERT INTO threads (name, title, phase, busy, repo, parent, forked_from, created_by, owner, created_at, updated_at, archived, model, spend, looping, failed, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET title = excluded.title, phase = excluded.phase, busy = excluded.busy, repo = excluded.repo, parent = excluded.parent, forked_from = excluded.forked_from, owner = excluded.owner, updated_at = excluded.updated_at, archived = excluded.archived, model = excluded.model, spend = excluded.spend, looping = excluded.looping, failed = excluded.failed, pinned = excluded.pinned`,
      update.name,
      next.title,
      next.phase,
      next.busy,
      next.repo,
      next.parent,
      next.forkedFrom,
      next.createdBy,
      next.owner,
      current?.createdAt ?? now,
      now,
      next.archived,
      next.model,
      next.spend,
      next.looping,
      next.failed,
      next.pinned,
    );
  }

  loopingFor(owner: string): string[] {
    return this.ctx.storage.sql
      .exec<{ name: string }>('SELECT name FROM threads WHERE owner = ? AND looping = 1', owner)
      .toArray()
      .map((row) => row.name);
  }

  share(name: string, owner: string): string {
    const existing = this.ctx.storage.sql
      .exec<{ token: string }>('SELECT token FROM shares WHERE name = ? AND owner = ?', name, owner)
      .toArray()[0];

    if (existing !== undefined) return existing.token;

    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/[+]/g, '-')
      .replace(/[/]/g, '_')
      .replace(/=+$/, '');

    this.ctx.storage.sql.exec(
      'INSERT INTO shares (token, name, owner, created_at) VALUES (?, ?, ?, ?)',
      token,
      name,
      owner,
      Date.now(),
    );

    return token;
  }

  unshare(name: string, owner: string): void {
    this.ctx.storage.sql.exec('DELETE FROM shares WHERE name = ? AND owner = ?', name, owner);
  }

  shared(token: string): { name: string; owner: string } | null {
    return (
      this.ctx.storage.sql
        .exec<{ name: string; owner: string }>(
          'SELECT name, owner FROM shares WHERE token = ?',
          token,
        )
        .toArray()[0] ?? null
    );
  }

  spendFor(owner: string): number {
    const row = this.ctx.storage.sql
      .exec<{ total: number | null; working: number | null }>(
        'SELECT SUM(spend) AS total, SUM(busy) AS working FROM threads WHERE owner = ?',
        owner,
      )
      .toArray()[0];

    return (row?.total ?? 0) + (row?.working ?? 0) * TURN_RESERVE;
  }

  limitFor(owner: string): number | null {
    return (
      this.ctx.storage.sql
        .exec<{ dollars: number }>('SELECT dollars FROM limits WHERE owner = ?', owner)
        .toArray()[0]?.dollars ?? null
    );
  }

  setLimit(owner: string, dollars: number | null): number | null {
    if (dollars === null) this.ctx.storage.sql.exec('DELETE FROM limits WHERE owner = ?', owner);
    else
      this.ctx.storage.sql.exec(
        'INSERT INTO limits (owner, dollars) VALUES (?, ?) ON CONFLICT(owner) DO UPDATE SET dollars = excluded.dollars',
        owner,
        dollars,
      );

    return this.limitFor(owner);
  }

  agentThreadsFor(owner: string): number {
    return (
      this.ctx.storage.sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM threads WHERE owner = ? AND created_by LIKE 'thread:%'",
          owner,
        )
        .toArray()[0]?.n ?? 0
    );
  }

  workingFor(owner: string): number {
    return (
      this.ctx.storage.sql
        .exec<{ n: number }>(
          'SELECT COUNT(*) AS n FROM threads WHERE owner = ? AND busy = 1',
          owner,
        )
        .toArray()[0]?.n ?? 0
    );
  }

  stats(now = Date.now()): InstanceStats {
    const sql = this.ctx.storage.sql;
    const totals = sql
      .exec<{
        threads: number;
        people: number;
        working: number | null;
        awake: number;
        agentMade: number;
        spend: number | null;
        firstAt: number | null;
        lastAt: number | null;
      }>(
        `SELECT COUNT(*) AS threads, COUNT(DISTINCT owner) AS people, SUM(busy) AS working,
          SUM(CASE WHEN phase = 'awake' THEN 1 ELSE 0 END) AS awake,
          SUM(CASE WHEN created_by LIKE 'thread:%' OR created_by = 'agent' THEN 1 ELSE 0 END) AS agentMade,
          SUM(spend) AS spend, MIN(created_at) AS firstAt, MAX(updated_at) AS lastAt FROM threads`,
      )
      .toArray()[0];
    const since = now - STATS_DAYS * DAY_MS;
    const counted = new Map(
      sql
        .exec<{ day: string; n: number }>(
          `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n
            FROM threads WHERE created_at >= ? GROUP BY day`,
          since,
        )
        .toArray()
        .map((row) => [row.day, row.n]),
    );
    const models = new Map<string, number>();

    for (const row of sql
      .exec<{ model: string; n: number }>('SELECT model, COUNT(*) AS n FROM threads GROUP BY model')
      .toArray())
      models.set(modelLabel(row.model), (models.get(modelLabel(row.model)) ?? 0) + row.n);

    const sources = new Map<string, number>();

    for (const row of sql
      .exec<{ createdBy: string; n: number }>(
        'SELECT created_by AS createdBy, COUNT(*) AS n FROM threads GROUP BY created_by',
      )
      .toArray())
      sources.set(sourceOf(row.createdBy), (sources.get(sourceOf(row.createdBy)) ?? 0) + row.n);

    return {
      threads: totals?.threads ?? 0,
      people: totals?.people ?? 0,
      working: totals?.working ?? 0,
      awake: totals?.awake ?? 0,
      agentMade: totals?.agentMade ?? 0,
      spend: totals?.spend ?? 0,
      firstAt: totals?.firstAt ?? null,
      lastAt: totals?.lastAt ?? null,
      perDay: lastDays(now).map((day) => ({ day, threads: counted.get(day) ?? 0 })),
      models: topCounts(models).map(([model, threads]) => ({ model, threads })),
      sources: topCounts(sources).map(([source, threads]) => ({ source, threads })),
      at: now,
    };
  }

  get(name: string): ThreadSummary | null {
    const row = this.ctx.storage.sql
      .exec<Row>('SELECT * FROM threads WHERE name = ?', name)
      .toArray()[0];

    return row === undefined ? null : fromRow(row);
  }

  list(owner: string, limit = 200): ThreadSummary[] {
    return this.ctx.storage.sql
      .exec<Row>(
        'SELECT * FROM threads WHERE owner = ? ORDER BY updated_at DESC LIMIT ?',
        owner,
        limit,
      )
      .toArray()
      .map(fromRow);
  }

  remove(name: string): void {
    this.ctx.storage.sql.exec('DELETE FROM threads WHERE name = ?', name);
  }

  setBase(repo: string, snapshotId: string, thread: string, setup: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO bases (repo, snapshot_id, thread, setup, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(repo) DO UPDATE SET snapshot_id = excluded.snapshot_id, thread = excluded.thread, setup = excluded.setup, at = excluded.at',
      repo,
      snapshotId,
      thread,
      setup,
      Date.now(),
    );
  }

  base(repo: string): { snapshotId: string; thread: string; setup: string; at: number } | null {
    const row = this.ctx.storage.sql
      .exec<{ snapshot_id: string; thread: string; setup: string; at: number }>(
        'SELECT snapshot_id, thread, setup, at FROM bases WHERE repo = ?',
        repo,
      )
      .toArray()[0];

    return row === undefined
      ? null
      : { snapshotId: row.snapshot_id, thread: row.thread, setup: row.setup, at: row.at };
  }

  bases(): { repo: string; thread: string; setup: string; at: number }[] {
    return this.ctx.storage.sql
      .exec<{ repo: string; thread: string; setup: string; at: number }>(
        'SELECT repo, thread, setup, at FROM bases ORDER BY at DESC',
      )
      .toArray();
  }
}
