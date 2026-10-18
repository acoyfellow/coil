const APP_PAGE = /^\/(t\/[a-z0-9][a-z0-9-]{0,62})?\/?$/;

const SERVER_PATH =
  /^\/(api\/|mcp$|oauth\/|s\/|assets\/|app\/|brand\/|icons\/|cdn-cgi\/|sw\.js$|manifest\.webmanifest$|favicon\.ico$)/;

export const PUBLIC_ROUTES = [
  '/docs',
  '/player',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/stats',
  '/stats.json',
] as const;

export const isKnownPath = (pathname: string, publicPages: object = {}): boolean =>
  APP_PAGE.test(pathname) ||
  SERVER_PATH.test(pathname) ||
  pathname in publicPages ||
  PUBLIC_ROUTES.some((route) => route === pathname);
