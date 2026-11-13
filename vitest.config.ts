import { defineConfig } from 'vitest/config';

const inlineFoldkit = { deps: { inline: ['foldkit'] } };

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'worker', include: ['test/**/*.test.ts'], exclude: ['test/client*.test.ts'] } },
      {
        test: {
          name: 'client',
          include: ['test/client*.test.ts', 'client/src/**/*.test.ts'],
          environment: 'happy-dom',
          setupFiles: ['./client/src/vitest-setup.ts'],
          server: inlineFoldkit,
        },
      },
    ],
  },
});
