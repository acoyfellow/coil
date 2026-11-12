import { type AccessEnv, accessAuth } from './access';
import { type CloudflareAuthEnv, cloudflareAuth } from './cloudflare';
import { devAuth } from './dev';
import { type Auth, authMode, type Identity } from './types';

export type GateEnv = AccessEnv &
  Partial<CloudflareAuthEnv> & {
    readonly COIL_AUTH?: string;
  };

export type GateResult =
  | { readonly kind: 'response'; readonly response: Response }
  | { readonly kind: 'admitted'; readonly identity: Identity };

export const authFor = (env: GateEnv, send: typeof fetch = fetch): Auth | null => {
  const mode = authMode(env.COIL_AUTH);

  if (env.COIL_AUTH === 'dev') return devAuth();

  if (mode === 'access') return accessAuth(env);

  if (mode === 'cloudflare' && env.DIRECTORY !== undefined)
    return cloudflareAuth({ ...env, DIRECTORY: env.DIRECTORY }, send);

  return null;
};

export const gate = async (
  request: Request,
  env: GateEnv,
  send: typeof fetch = fetch,
): Promise<GateResult> => {
  const auth = authFor(env, send);

  if (auth === null)
    return {
      kind: 'response',
      response: new Response('COIL_AUTH must be access or cloudflare', { status: 503 }),
    };

  const own = await auth.routes(request);

  if (own !== null) return { kind: 'response', response: own };

  const admission = await auth.admit(request);

  return 'refused' in admission
    ? { kind: 'response', response: admission.refused }
    : { kind: 'admitted', identity: admission.identity };
};
