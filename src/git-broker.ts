export type GitCredential = {
  readonly host: string;
  readonly username: string;
  readonly token: string;
};

export type BrokerEnv = {
  readonly GIT_TOKENS?: string;
};

export type BrokerRequest = {
  readonly thread: string;
  readonly remote: string;
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: ArrayBuffer | null;
};

export type BrokerReply = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: ArrayBuffer;
};

const ALLOWED_PATHS = /^\/(info\/refs|git-upload-pack|git-receive-pack)$/;
const ALLOWED_SERVICES = new Set(['git-upload-pack', 'git-receive-pack']);
const FORWARDED_HEADERS = ['content-type', 'accept', 'git-protocol', 'content-encoding'];

export const parseCredentials = (raw: string | undefined): GitCredential[] => {
  if (raw === undefined || raw.trim() === '') return [];

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is GitCredential =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as GitCredential).host === 'string' &&
          typeof (item as GitCredential).token === 'string',
      )
      .map((item) => ({
        host: item.host,
        username: item.username ?? 'x-access-token',
        token: item.token,
      }));
  } catch {
    return [];
  }
};

export const credentialFor = (
  credentials: readonly GitCredential[],
  remote: string,
): GitCredential | null => {
  const host = new URL(remote).host;

  return credentials.find((credential) => credential.host === host) ?? null;
};

export const brokerTarget = (remote: string, path: string, search: string): URL | null => {
  const base = new URL(remote);

  if (base.protocol !== 'https:') return null;
  if (!ALLOWED_PATHS.test(path)) return null;

  const service = new URLSearchParams(search).get('service');

  if (path === '/info/refs' && (service === null || !ALLOWED_SERVICES.has(service))) return null;

  const repo = base.pathname.replace(/\/+$/, '');
  const target = new URL(`${base.origin}${repo}${path}`);

  if (service !== null) target.searchParams.set('service', service);

  return target;
};

export const forwardHeaders = (
  incoming: Readonly<Record<string, string>>,
  credential: GitCredential | null,
): Headers => {
  const headers = new Headers();

  for (const name of FORWARDED_HEADERS) {
    const value = incoming[name];

    if (value !== undefined) headers.set(name, value);
  }

  headers.set('user-agent', 'coil-git-broker');

  if (credential !== null)
    headers.set('authorization', `Basic ${btoa(`${credential.username}:${credential.token}`)}`);

  return headers;
};

export const relay = async (
  request: BrokerRequest,
  credentials: readonly GitCredential[],
  send: typeof fetch,
): Promise<BrokerReply> => {
  const [path, search = ''] = request.path.split('?');
  const target = brokerTarget(request.remote, path ?? '', search);

  if (target === null)
    return {
      status: 403,
      headers: {},
      body: new TextEncoder().encode('git broker: refused').slice().buffer as ArrayBuffer,
    };

  const response = await send(target, {
    method: request.method,
    headers: forwardHeaders(request.headers, credentialFor(credentials, request.remote)),
    body: request.body,
  });
  const headers: Record<string, string> = {};

  for (const name of ['content-type', 'cache-control']) {
    const value = response.headers.get(name);

    if (value !== null) headers[name] = value;
  }

  return { status: response.status, headers, body: await response.arrayBuffer() };
};

export const BROKER_HOST = 'git.coil';

export const brokerRemote = (remote: string): string => {
  const url = new URL(remote);

  return `http://${BROKER_HOST}/${url.host}${url.pathname.replace(/\.git$/, '')}.git`;
};

const SERVICE_SUFFIX = /(\/info\/refs|\/git-upload-pack|\/git-receive-pack)$/;

export const fromBrokerUrl = (url: URL): { remote: string; path: string } | null => {
  if (url.host !== BROKER_HOST) return null;

  const match = SERVICE_SUFFIX.exec(url.pathname);

  if (match === null) return null;

  const repoPath = url.pathname.slice(1, match.index);
  const slash = repoPath.indexOf('/');

  if (slash <= 0) return null;

  return {
    remote: `https://${repoPath.slice(0, slash)}${repoPath.slice(slash)}`,
    path: `${match[1]}${url.search}`,
  };
};

const headerRecord = (headers: Headers): Record<string, string> => {
  const record: Record<string, string> = {};

  headers.forEach((value, name) => {
    record[name.toLowerCase()] = value;
  });

  return record;
};

export const brokerFetch = async (
  request: Request,
  credentials: readonly GitCredential[],
  send: typeof fetch,
): Promise<Response> => {
  const parsed = fromBrokerUrl(new URL(request.url));

  if (parsed === null) return new Response('git broker: refused', { status: 403 });

  const reply = await relay(
    {
      thread: '',
      remote: parsed.remote,
      path: parsed.path,
      method: request.method,
      headers: headerRecord(request.headers),
      body: request.method === 'GET' ? null : await request.arrayBuffer(),
    },
    credentials,
    send,
  );

  return new Response(reply.body, { status: reply.status, headers: reply.headers });
};
