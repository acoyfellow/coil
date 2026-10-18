import { describe, expect, it } from 'vitest';
import { isKnownPath } from '../src/paths';
import { robots, SITEMAP_PATHS, seoHead, sitemap } from '../src/seo';

describe('unknown paths get a real 404', () => {
  it('knows the app, server routes, and public pages', () => {
    for (const path of [
      '/',
      '/t/my-thread-1a2b3c',
      '/api/rpc',
      '/mcp',
      '/oauth/login',
      '/s/abcdefghijklmnop',
      '/icons/favicon.svg',
      '/brand/coil-social.png',
      '/docs',
      '/llms.txt',
      '/robots.txt',
      '/sitemap.xml',
    ])
      expect(isKnownPath(path)).toBe(true);
  });

  it('does not claim paths that do not exist', () => {
    for (const path of ['/nope', '/wp-admin', '/t/', '/T/upper', '/docs/extra', '/statsx'])
      expect(isKnownPath(path)).toBe(false);
  });
});

describe('search engines get the basics', () => {
  it('robots points at the sitemap and keeps private paths out', () => {
    const text = robots('https://coil.example');

    expect(text).toContain('Sitemap: https://coil.example/sitemap.xml');
    for (const path of ['/api/', '/t/', '/s/', '/oauth/'])
      expect(text).toContain(`Disallow: ${path}`);
  });

  it('the sitemap lists only public pages', () => {
    const xml = sitemap('https://coil.example');

    for (const path of SITEMAP_PATHS)
      expect(xml).toContain(`<loc>https://coil.example${path}</loc>`);
    expect(xml).not.toContain('/t/');
  });

  it('every page head has a canonical, social cards, and an escaped title', () => {
    const head = seoHead({
      origin: 'https://coil.example',
      path: '/docs',
      title: 'a "quoted" <title>',
      description: 'd',
    });

    expect(head).toContain('<link rel="canonical" href="https://coil.example/docs">');
    expect(head).toContain('og:image" content="https://coil.example/brand/coil-social.png"');
    expect(head).toContain('twitter:card" content="summary_large_image"');
    expect(head).toContain('a &quot;quoted&quot; &lt;title&gt;');
    expect(head).not.toContain('<title>a "quoted"');
  });
});
