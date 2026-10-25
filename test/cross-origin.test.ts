import { describe, expect, test } from 'vitest';
import { settingsPath } from '../src/connectors/routes';
import { isCrossOriginWrite } from '../src/origin';

const post = (origin: string) =>
  new Request('https://coil.test/connectors/ax-mcp/start', { method: 'POST', headers: { origin } });

describe('cross-origin writes', () => {
  test('a form post from coil itself is a same-origin write', () => {
    expect(isCrossOriginWrite(post('https://coil.test'))).toBe(false);
  });

  test('a post from another site is refused', () => {
    expect(isCrossOriginWrite(post('https://evil.test'))).toBe(true);
  });
});

describe('connector routes return to the settings dialog', () => {
  test('a plain return goes to the app with the Connectors section open', () => {
    expect(settingsPath('/')).toBe('/?settings=connectors');
  });

  test('a thread return keeps the thread', () => {
    expect(settingsPath('/t/abc')).toBe('/t/abc?settings=connectors');
  });

  test('a problem travels with the redirect, and a foreign path does not', () => {
    expect(settingsPath('https://evil.test/x', 'refused')).toBe(
      '/?settings=connectors&connector_error=refused',
    );
  });
});
