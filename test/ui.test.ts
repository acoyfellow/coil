import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { page } from '../src/ui/index';
import { sharedPage } from '../src/ui/shared';
import { STYLE } from '../src/ui/style';
import { serviceWorker } from '../src/ui/sw';

describe('browser code', () => {
  it('the service worker parses and never caches the API', () => {
    const source = serviceWorker('test');

    expect(() => new Function('self', 'caches', source)).not.toThrow();
    expect(source).toContain("url.pathname.startsWith('/api/')");
    expect(source).toContain("url.pathname === '/mcp'");
  });

  it('a new shell version names a new cache, so an installed app drops the old one', () => {
    const before = serviceWorker('term-a-app-1');
    const after = serviceWorker('term-a-app-2');

    expect(before).not.toBe(after);
    expect(after).toContain("const SHELL = 'coil-shell-term-a-app-2'");
    expect(after).toContain("key.startsWith('coil-') && key !== SHELL");
  });

  it('only the home page is saved as the offline shell, and hashed bundles are the only cache-first files', () => {
    const source = serviceWorker('v');

    expect(source).toContain("url.pathname === '/') {");
    expect(source).toContain("url.pathname.startsWith('/app/assets/')");
    expect(source).not.toContain("url.pathname.startsWith('/icons/')");
  });
});

describe('web app manifest', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it('is installable', () => {
    expect(manifest.name).toBe('coil');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('ships 192 and 512 icons, including maskable ones, that exist on disk', () => {
    for (const size of ['192x192', '512x512']) {
      expect(manifest.icons.some((i) => i.sizes === size && i.purpose === 'any')).toBe(true);
      expect(manifest.icons.some((i) => i.sizes === size && i.purpose === 'maskable')).toBe(true);
    }

    for (const icon of manifest.icons)
      expect(() => readFileSync(`public${icon.src}`)).not.toThrow();
  });
});

describe('installed app on a phone', () => {
  it('keeps the top bar below the status bar and clock', () => {
    expect(STYLE).toMatch(/\.app\{[^}]*padding:env\(safe-area-inset-top\)/);
    expect(STYLE).toMatch(/\.app\.show-side \.side\{[^}]*padding-top:env\(safe-area-inset-top\)/);
    expect(STYLE).toMatch(/\.app\.show-panel \.panel\{[^}]*padding-top:env\(safe-area-inset-top\)/);
  });
});

describe('phone text entry', () => {
  it('keeps every text-entry control at 16px on phones so iOS Safari does not zoom', () => {
    const rule =
      /@media \(max-width: 500px\), \(pointer: coarse\)\{([^{]+)\{font-size:16px !important\}\}/.exec(
        STYLE,
      );

    expect(rule).not.toBeNull();
    for (const selector of [
      'input:not([type=checkbox])',
      'select',
      'textarea',
      '[contenteditable]',
    ])
      expect(rule?.[1]).toContain(selector);
  });
});

it('the shared page escapes thread text', () => {
  const html = sharedPage({
    title: '<b>t</b>',
    model: 'm',
    messages: [{ id: '1', kind: 'm', role: 'assistant', text: '<script>alert(1)</script>' }],
  } as never);

  expect(html).not.toContain('<script>alert');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).toContain('&lt;b&gt;t&lt;/b&gt;');
});

it('the page shell uses the brand favicon and social card', () => {
  const html = readFileSync('src/ui/index.ts', 'utf8');

  expect(html).toContain('/icons/favicon.svg');
  expect(html).toContain('/brand/coil-social.png');
});

describe('link previews', () => {
  it('points og:image and twitter:image at an absolute URL on the serving host', () => {
    const html = page('https://coil.example.com');

    expect(html).toContain(
      '<meta property="og:image" content="https://coil.example.com/brand/coil-social.png">',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://coil.example.com/brand/coil-social.png">',
    );
  });

  it('ships the social card the page points at', () => {
    const png = readFileSync('public/brand/coil-social.png');

    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
