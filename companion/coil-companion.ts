import { execFileSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

type ExportedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;
  httpOnly: boolean;
  secure: boolean;
};

type RawCookie = {
  host_key: string;
  name: string;
  path: string;
  is_secure: number;
  is_httponly: number;
  expires_utc: number;
  encrypted_hex: string;
};

const CHROME_ROOT = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
const KEYCHAIN_SERVICE = 'Chrome Safe Storage';
const EPOCH_DELTA_US = 11644473600000000;

const chromeKey = (): string => {
  const secret = execFileSync('security', ['find-generic-password', '-a', 'Chrome', '-s', KEYCHAIN_SERVICE, '-w'], {
    encoding: 'utf8',
    timeout: 2 * 60 * 1000,
  }).trim();
  if (secret === '') throw new Error('empty keychain password');
  return secret;
};

const cookieDatabase = (): string => {
  if (!existsSync(CHROME_ROOT)) throw new Error('no Chrome profile found');
  const candidates: string[] = [];
  for (const entry of readdirSync(CHROME_ROOT)) {
    for (const name of ['Cookies', join('Network', 'Cookies')]) {
      const file = join(CHROME_ROOT, entry, name);
      if (existsSync(file)) candidates.push(file);
    }
  }
  if (candidates.length === 0) throw new Error('no cookies database found');
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] as string;
};

const readRawCookies = (): { rows: RawCookie[]; integrityPrefix: boolean } => {
  const source = cookieDatabase();
  const dir = mkdtempSync(join(tmpdir(), 'coil-chrome-'));
  const copy = join(dir, 'Cookies');
  copyFileSync(source, copy);
  const query =
    'SELECT host_key, name, path, is_secure, is_httponly, expires_utc, hex(encrypted_value) AS encrypted_hex FROM cookies';
  const json = execFileSync('sqlite3', ['-readonly', '-json', copy, query], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const rows = JSON.parse(json) as RawCookie[];
  const meta = execFileSync('sqlite3', ['-readonly', copy, "SELECT value FROM meta WHERE key = 'version'"], { encoding: 'utf8' }).trim();
  const integrityPrefix = Number(meta) >= 24;
  return { rows: rows.filter((row) => row.encrypted_hex !== ''), integrityPrefix };
};

const decryptValue = (hex: string, derived: Buffer, integrityPrefix: boolean): string | null => {
  const version = hex.slice(0, 6);
  if (version !== Buffer.from('v10').toString('hex') && version !== Buffer.from('v20').toString('hex')) return null;
  const cipher = Buffer.from(hex.slice(6), 'hex');
  const decipher = createDecipheriv('aes-128-cbc', derived, Buffer.alloc(16, 0x20));
  try {
    const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
    return (integrityPrefix ? plain.subarray(32) : plain).toString('utf8');
  } catch {
    return null;
  }
};

const toExported = (rows: RawCookie[], key: string, integrityPrefix: boolean): { cookies: ExportedCookie[]; undecryptable: number } => {
  const cookies: ExportedCookie[] = [];
  let undecryptable = 0;
  const derived = pbkdf2Sync(key, 'saltysalt', 1003, 16, 'sha1');
  for (const row of rows) {
    const value = decryptValue(row.encrypted_hex, derived, integrityPrefix);
    if (value === null) {
      undecryptable += 1;
      continue;
    }
    const expires = row.expires_utc > 0 ? Math.floor((row.expires_utc - EPOCH_DELTA_US) / 1e6) : null;
    if (expires !== null && expires * 1000 < Date.now()) continue;
    cookies.push({
      name: row.name,
      value,
      domain: row.host_key,
      path: row.path || '/',
      expires: expires !== null && expires > 0 ? expires : null,
      httpOnly: row.is_httponly === 1,
      secure: row.is_secure === 1,
    });
  }
  return { cookies, undecryptable };
};

const tokenFile = (): string => join(homedir(), '.coil-companion', 'token');

const loadOrCreateToken = (): string => {
  const file = tokenFile();
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(join(homedir(), '.coil-companion'), { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString('hex');
  writeFileSync(file, token, { mode: 0o600 });
  return token;
};

const sync = (): { cookies: ExportedCookie[]; undecryptable: number } => {
  const key = chromeKey();
  const { rows, integrityPrefix } = readRawCookies();
  return toExported(rows, key, integrityPrefix);
};

const serve = (): void => {
  const token = loadOrCreateToken();
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET');
      response.setHeader('Access-Control-Allow-Headers', 'x-coil-token');
      response.writeHead(204);
      response.end();
      return;
    }
    const presented = request.headers['x-coil-token'];
    const presentedBuffer = Buffer.from(Array.isArray(presented) ? (presented[0] ?? '') : (presented ?? ''));
    const tokenBuffer = Buffer.from(token);
    const authorized = presentedBuffer.length === tokenBuffer.length && timingSafeEqual(presentedBuffer, tokenBuffer);
    if (!authorized) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'bad token' }));
      return;
    }
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, companion: 'coil-companion' }));
      return;
    }
    if (request.url !== '/sync') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    try {
      const result = sync();
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch (cause) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: cause instanceof Error ? cause.message : String(cause) }));
    }
  });
  server.listen(18799, '127.0.0.1', () => console.log('coil-companion listening on 127.0.0.1:18799'));
};

const main = (): void => {
  const args = process.argv.slice(2);
  if (args.includes('--sync')) {
    const result = sync();
    console.log(JSON.stringify({ count: result.cookies.length, undecryptable: result.undecryptable }));
    return;
  }
  if (args.includes('--sync-json')) {
    const result = sync();
    console.log(JSON.stringify(result));
    return;
  }
  if (args.includes('--health')) {
    console.log(JSON.stringify({ ok: true, companion: 'coil-companion' }));
    return;
  }
  serve();
};

main();
