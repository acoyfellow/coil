import { describe, expect, test } from 'vitest';
import { isAppPath } from './route';

describe('which links stay inside the app', () => {
  test('home and thread pages are app routes', () => {
    expect(isAppPath('/')).toBe(true);
    expect(isAppPath('/t/my-thread-1a2b3c')).toBe(true);
  });

  test('server pages load for real, so their links work', () => {
    for (const path of [
      '/oauth/gateway',
      '/oauth/login',
      '/oauth/logout',
      '/docs',
      '/llms.txt',
      '/t/',
    ])
      expect(isAppPath(path)).toBe(false);
  });
});
