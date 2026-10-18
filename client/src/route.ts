const THREAD_PATH = /^\/t\/([a-z0-9][a-z0-9-]{0,62})\/?$/;

export const threadFromPath = (pathname: string): string | null =>
  THREAD_PATH.exec(pathname)?.[1] ?? null;

export const pathForThread = (name: string | null): string => (name === null ? '/' : `/t/${name}`);

export const isAppPath = (pathname: string): boolean =>
  pathname === '/' || THREAD_PATH.test(pathname);
