const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

const escapeHtml = (value: string) => value.replace(/[&<>"]/gu, (char) => ENTITIES[char] ?? char);

export type Seo = {
  readonly origin: string;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly index?: boolean;
};

export const SOCIAL_IMAGE = '/brand/coil-social.png';

export const seoHead = ({ origin, path, title, description, index = true }: Seo) => {
  const url = `${origin}${path}`;
  const image = `${origin}${SOCIAL_IMAGE}`;

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${index ? 'index, follow' : 'noindex'}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="coil">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    '<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">',
  ].join('\n');
};

export const SITEMAP_PATHS = ['/', '/docs', '/stats'] as const;

export const sitemap = (origin: string) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_PATHS.map((path) => `<url><loc>${escapeHtml(`${origin}${path}`)}</loc></url>`).join('\n')}
</urlset>
`;

export const robots = (origin: string) =>
  `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /t/\nDisallow: /s/\nDisallow: /oauth/\n\nSitemap: ${origin}/sitemap.xml\n`;
