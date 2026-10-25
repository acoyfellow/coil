export type ConnectorAuth = {
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly registrationEndpoint: string;
  readonly resource: string;
};

export type Connector = {
  readonly id: string;
  readonly upstream: string;
  readonly description: string;
  readonly auth: ConnectorAuth;
  readonly expose: readonly string[];
};

export type ConnectorEnv = {
  readonly CONNECTORS_JSON?: string;
  readonly CONNECTOR_SEAL_KEY?: string;
};

const CONNECTOR_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,64}$/u;
const MAX_CONNECTORS = 8;
const MAX_EXPOSED = 64;

export class ConnectorConfigError extends Error {}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const httpsUrl = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new ConnectorConfigError(`${field} is missing`);

  const url = URL.parse(value);

  if (url === null || url.protocol !== 'https:' || url.username !== '' || url.password !== '')
    throw new ConnectorConfigError(`${field} must be an https URL without credentials`);

  return url.toString();
};

const exposed = (value: unknown, id: string): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0)
    throw new ConnectorConfigError(`${id}.expose must list at least one tool`);

  const names = [...new Set(value)];

  if (!names.every((name): name is string => typeof name === 'string' && TOOL_NAME.test(name)))
    throw new ConnectorConfigError(`${id}.expose has a tool name that is not allowed`);

  return names;
};

const connectorFrom = (id: string, raw: unknown): Connector => {
  if (!CONNECTOR_ID.test(id)) throw new ConnectorConfigError(`connector id ${id} is not allowed`);

  const body = record(raw);
  const auth = record(body?.auth);

  if (body === null || auth === null)
    throw new ConnectorConfigError(`${id} needs upstream and auth`);

  return {
    id,
    upstream: httpsUrl(body.upstream, `${id}.upstream`),
    description: typeof body.description === 'string' ? body.description.slice(0, 300) : id,
    auth: {
      authorizationEndpoint: httpsUrl(
        auth.authorizationEndpoint,
        `${id}.auth.authorizationEndpoint`,
      ),
      tokenEndpoint: httpsUrl(auth.tokenEndpoint, `${id}.auth.tokenEndpoint`),
      registrationEndpoint: httpsUrl(auth.registrationEndpoint, `${id}.auth.registrationEndpoint`),
      resource: httpsUrl(auth.resource, `${id}.auth.resource`),
    },
    expose: exposed(body.expose, id),
  };
};

export const parseConnectors = (raw: string | undefined): readonly Connector[] => {
  if (raw === undefined || raw.trim() === '') return [];

  const parsed = record(JSON.parse(raw));

  if (parsed === null) throw new ConnectorConfigError('CONNECTORS_JSON must be an object');

  const connectors = Object.entries(parsed).map(([id, body]) => connectorFrom(id, body));

  if (connectors.length > MAX_CONNECTORS)
    throw new ConnectorConfigError(`at most ${MAX_CONNECTORS} connectors`);

  if (connectors.reduce((total, each) => total + each.expose.length, 0) > MAX_EXPOSED)
    throw new ConnectorConfigError(`at most ${MAX_EXPOSED} exposed tools in total`);

  return connectors;
};

export const connectorsOf = (env: ConnectorEnv): readonly Connector[] => {
  try {
    return parseConnectors(env.CONNECTORS_JSON);
  } catch (cause) {
    console.error(
      'connector config refused',
      cause instanceof Error ? cause.message : String(cause),
    );

    return [];
  }
};

export const connectorNamed = (env: ConnectorEnv, id: string): Connector | null =>
  connectorsOf(env).find((each) => each.id === id) ?? null;
