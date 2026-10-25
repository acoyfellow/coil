import { describe, expect, test } from 'vitest';
import { connectorsPage } from '../src/connectors/page';
import { connectorsHtmlResponse } from '../src/connectors/routes';
import { isCrossOriginWrite } from '../src/origin';
import { FONTS } from '../src/ui/style';

const post = (origin: string) =>
  new Request('https://coil.test/connectors/ax-mcp/start', { method: 'POST', headers: { origin } });

describe('cross-origin writes', () => {
  test('a form post from coil itself is a same-origin write', () => {
    expect(isCrossOriginWrite(post('https://coil.test'))).toBe(false);
  });

  test('a post from another site is refused', () => {
    expect(isCrossOriginWrite(post('https://evil.test'))).toBe(true);
  });

  test('the connectors page keeps its origin on form posts and loads fonts as a stylesheet', () => {
    const page = connectorsHtmlResponse(connectorsPage([], null));
    const body = connectorsPage([], null);

    expect(page.headers.get('referrer-policy')).toBe('same-origin');
    expect(body).toContain(`<link rel="stylesheet" href="${FONTS}">`);
    expect(body.replaceAll(`href="${FONTS}"`, '')).not.toContain(FONTS);
  });
});
