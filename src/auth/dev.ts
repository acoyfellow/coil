import type { Auth } from './types';

export const DEV_OWNER = 'dev@localhost';

export const devAuth = (): Auth => ({
  mode: 'access',
  routes: async () => null,
  admit: async () => ({ identity: { who: DEV_OWNER } }),
});
