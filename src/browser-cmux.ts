import type { BrowserTools } from './agent';
import { normalizeUrl } from './browser';

export type CmuxRun = (argv: readonly string[]) => Promise<string>;
export type DescribeImage = (imagePath: string, question: string) => Promise<string>;

const OK_PREFIX = 'OK';
const FILE_URL_PREFIX = 'file:';

export const screenshotPathOf = (reply: string): string => {
  const trimmed = reply.trim();
  const location = (
    trimmed.startsWith(OK_PREFIX) ? trimmed.slice(OK_PREFIX.length) : trimmed
  ).trim();
  return location.startsWith(FILE_URL_PREFIX)
    ? decodeURIComponent(new URL(location).pathname)
    : location;
};

export const cmuxBrowserTools = (
  run: CmuxRun,
  surface: string,
  describe: DescribeImage = async (imagePath) => `screenshot saved at ${imagePath}`,
): BrowserTools => {
  const browser = (...args: string[]) => run(['browser', surface, ...args]);
  const where = async () => {
    const [title, url] = await Promise.all([browser('get', 'title'), browser('url')]);
    return `${title.trim() === '' ? '(no title)' : title.trim()}\n${url.trim()}`;
  };

  return {
    open: async (url) => {
      await browser('goto', normalizeUrl(url));
      await browser('wait', '--load-state', 'complete', '--timeout', '15');
      return where();
    },
    snapshot: async () => {
      const [page, refs, text] = await Promise.all([
        where(),
        browser('snapshot', '--interactive', '--compact'),
        browser('get', 'text', 'body'),
      ]);
      return `${page}\n\n${refs.trim()}\n\ntext:\n${text.trim().slice(0, 2500)}`;
    },
    click: async (ref) => {
      await browser('click', ref);
      return `clicked ${ref}; now at ${await where()}`;
    },
    type: async (text, ref) => {
      if (ref === undefined) await browser('type', ':focus', text);
      else await browser('fill', ref, text);
      return `typed ${text.length} chars`;
    },
    key: async (key) => {
      await browser('press', key);
      return `pressed ${key}; now at ${await where()}`;
    },
    evaluate: async (expression) => (await browser('eval', expression)).trim(),
    look: async (question) => {
      const imagePath = screenshotPathOf(await browser('screenshot'));
      return `${await where()}\n${await describe(imagePath, question)}`;
    },
    logs: async (clear) => {
      const lines = (await browser('console', 'list')).trim();
      if (clear) await browser('console', 'clear');
      return lines === '' || lines === 'No console entries' ? '(no console messages)' : lines;
    },
  };
};
