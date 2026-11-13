import type { Computer, Entry } from './computer';

export type WorkspaceFile = {
  readonly path: string;
  readonly hash: string;
  readonly bytes: number;
};

export const MAX_STORED_FILE_BYTES = 1_000_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const normalizePath = (path: string): string => {
  const parts: string[] = [];

  for (const part of path.replace(/^\/workspace\/?/, '').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') throw new Error(`path escapes the workspace: ${path}`);
    parts.push(part);
  }

  return parts.join('/');
};

export const hashBytes = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const listUnder = (paths: readonly string[], directory: string): Entry[] => {
  const prefix = normalizePath(directory);
  const base = prefix === '' ? '' : `${prefix}/`;
  const seen = new Map<string, string>();

  for (const path of paths) {
    if (!path.startsWith(base)) continue;

    const rest = path.slice(base.length);
    const slash = rest.indexOf('/');

    if (slash === -1) seen.set(rest, 'file');
    else seen.set(rest.slice(0, slash), 'directory');
  }

  return [...seen]
    .map(([name, type]) => ({ name, type }))
    .sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1,
    );
};

export class WorkspaceStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      'CREATE TABLE IF NOT EXISTS ws_blobs (hash TEXT PRIMARY KEY, bytes BLOB NOT NULL, size INTEGER NOT NULL)',
    );
    sql.exec('CREATE TABLE IF NOT EXISTS ws_files (path TEXT PRIMARY KEY, hash TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS ws_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  async write(path: string, content: string | Uint8Array): Promise<WorkspaceFile> {
    const key = normalizePath(path);

    if (key === '') throw new Error('a file needs a path');

    const bytes = typeof content === 'string' ? encoder.encode(content) : content;

    if (bytes.byteLength > MAX_STORED_FILE_BYTES)
      throw new Error(`${key} is ${bytes.byteLength} bytes; the store keeps files up to 1 MB`);

    const hash = await hashBytes(bytes);

    this.sql.exec(
      'INSERT INTO ws_blobs (hash, bytes, size) VALUES (?, ?, ?) ON CONFLICT(hash) DO NOTHING',
      hash,
      bytes,
      bytes.byteLength,
    );
    this.sql.exec(
      'INSERT INTO ws_files (path, hash) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET hash = excluded.hash',
      key,
      hash,
    );

    return { path: key, hash, bytes: bytes.byteLength };
  }

  read(path: string): string | null {
    const row = this.sql
      .exec<{ bytes: ArrayBuffer }>(
        'SELECT b.bytes AS bytes FROM ws_files f JOIN ws_blobs b ON b.hash = f.hash WHERE f.path = ?',
        normalizePath(path),
      )
      .toArray()[0];

    return row === undefined ? null : decoder.decode(row.bytes);
  }

  list(directory: string): Entry[] {
    return listUnder(this.paths(), directory);
  }

  paths(): string[] {
    return this.sql
      .exec<{ path: string }>('SELECT path FROM ws_files ORDER BY path')
      .toArray()
      .map((row) => row.path);
  }

  files(): { path: string; content: Uint8Array }[] {
    return this.sql
      .exec<{ path: string; bytes: ArrayBuffer }>(
        'SELECT f.path AS path, b.bytes AS bytes FROM ws_files f JOIN ws_blobs b ON b.hash = f.hash ORDER BY f.path',
      )
      .toArray()
      .map((row) => ({ path: row.path, content: new Uint8Array(row.bytes) }));
  }

  manifest(): WorkspaceFile[] {
    return this.sql
      .exec<WorkspaceFile>(
        'SELECT f.path AS path, f.hash AS hash, b.size AS bytes FROM ws_files f JOIN ws_blobs b ON b.hash = f.hash ORDER BY f.path',
      )
      .toArray();
  }

  get count(): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM ws_files').one().n;
  }

  get sealed(): boolean {
    return (
      this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM ws_meta WHERE key = 'sealed'").one()
        .n > 0
    );
  }

  seal(): void {
    this.sql.exec(
      "INSERT INTO ws_meta (key, value) VALUES ('sealed', '1') ON CONFLICT(key) DO NOTHING",
    );
  }

  clear(): void {
    this.sql.exec('DELETE FROM ws_files');
    this.sql.exec('DELETE FROM ws_blobs');
  }
}

export type Files = {
  readonly read: (path: string) => Promise<string>;
  readonly write: (path: string, content: string) => Promise<void>;
  readonly list: (path: string) => Promise<Entry[]>;
};

export type FilesDeps = {
  readonly store: WorkspaceStore;
  readonly running: () => boolean;
  readonly box: () => Promise<Computer>;
};

export const filesFor = ({ store, running, box }: FilesDeps): Files => ({
  read: async (path) => {
    if (running()) return (await box()).readFile(path);

    const pending = store.read(path);

    if (pending !== null) return pending;
    if (!store.sealed) throw new Error(`${normalizePath(path)} does not exist`);

    return (await box()).readFile(path);
  },
  write: async (path, content) => {
    if (running()) {
      await (await box()).writeFile(path, content);
      return;
    }

    await store.write(path, content);
  },
  list: async (path) => {
    if (running()) return (await box()).list(path);

    return store.sealed ? (await box()).list(path) : store.list(path);
  },
});

export const flushInto = async (store: WorkspaceStore, box: Computer): Promise<number> => {
  const files = store.files();

  for (const file of files) await box.writeFile(file.path, file.content.slice().buffer);

  store.clear();

  return files.length;
};
