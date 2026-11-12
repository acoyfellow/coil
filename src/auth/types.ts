export type AuthMode = 'access' | 'cloudflare';

export type Identity = { readonly who: string };

export type Admission = { readonly identity: Identity } | { readonly refused: Response };

export type Auth = {
  readonly mode: AuthMode;
  readonly admit: (request: Request) => Promise<Admission>;
  readonly routes: (request: Request) => Promise<Response | null>;
};

export const CLOUDFLARE_OWNER_PREFIX = 'cf:';

export const isCloudflareOwner = (owner: string) => owner.startsWith(CLOUDFLARE_OWNER_PREFIX);

export const authMode = (raw: string | undefined): AuthMode | null => {
  if (raw === undefined || raw === '' || raw === 'access') return 'access';
  if (raw === 'dev') return 'access';

  return raw === 'cloudflare' ? 'cloudflare' : null;
};

export const mayUseHostInference = (rawAuthMode: string | undefined, owner: string): boolean =>
  authMode(rawAuthMode) === 'access' && !isCloudflareOwner(owner);
