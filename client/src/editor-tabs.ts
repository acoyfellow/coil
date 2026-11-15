import { type Buffer, isDirty } from './editor-state';

export type Tabs = {
  readonly open: readonly Buffer[];
  readonly active: string | null;
};

export const noTabs: Tabs = { open: [], active: null };

export const activeBuffer = (tabs: Tabs): Buffer | null =>
  tabs.open.find((buffer) => buffer.path === tabs.active) ?? null;

export const hasTab = (tabs: Tabs, path: string): boolean =>
  tabs.open.some((buffer) => buffer.path === path);

export const focusTab = (tabs: Tabs, path: string): Tabs =>
  hasTab(tabs, path) ? { ...tabs, active: path } : tabs;

export const addTab = (tabs: Tabs, buffer: Buffer): Tabs =>
  hasTab(tabs, buffer.path)
    ? { ...tabs, active: buffer.path }
    : { open: [...tabs.open, buffer], active: buffer.path };

export const updateTab = (tabs: Tabs, path: string, step: (buffer: Buffer) => Buffer): Tabs => ({
  ...tabs,
  open: tabs.open.map((buffer) => (buffer.path === path ? step(buffer) : buffer)),
});

export const closeTab = (tabs: Tabs, path: string): Tabs => {
  const index = tabs.open.findIndex((buffer) => buffer.path === path);

  if (index === -1) return tabs;

  const open = tabs.open.filter((buffer) => buffer.path !== path);
  const neighbour = open[Math.min(index, open.length - 1)];
  const active = tabs.active === path ? (neighbour?.path ?? null) : tabs.active;

  return { open, active };
};

export type CloseStep =
  | { readonly kind: 'closed'; readonly tabs: Tabs }
  | { readonly kind: 'ask'; readonly path: string };

export const requestClose = (tabs: Tabs, path: string): CloseStep => {
  const buffer = tabs.open.find((candidate) => candidate.path === path);

  if (buffer !== undefined && isDirty(buffer)) return { kind: 'ask', path };

  return { kind: 'closed', tabs: closeTab(tabs, path) };
};

export const dirtyPaths = (tabs: Tabs): string[] =>
  tabs.open.filter(isDirty).map((buffer) => buffer.path);

const subsequenceScore = (needle: string, hay: string): number | null => {
  let at = 0;
  let score = 0;
  let previous = -2;

  for (const char of needle) {
    const found = hay.indexOf(char, at);

    if (found === -1) return null;

    score += found === previous + 1 ? 3 : 1;
    if (found === 0 || '/._-'.includes(hay[found - 1] ?? '')) score += 2;
    previous = found;
    at = found + 1;
  }

  return score - hay.length / 100;
};

export const fuzzyFiles = (files: readonly string[], query: string, limit = 50): string[] => {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '');

  if (needle === '') return files.slice(0, limit);

  return files
    .map((path) => {
      const lower = path.toLowerCase();
      const name = lower.slice(lower.lastIndexOf('/') + 1);
      const onName = subsequenceScore(needle, name);
      const onPath = subsequenceScore(needle, lower);
      const score = onName === null ? onPath : onName + 10;

      return { path, score };
    })
    .filter((hit): hit is { path: string; score: number } => hit.score !== null)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((hit) => hit.path);
};

export const tabLabel = (path: string): string => path.slice(path.lastIndexOf('/') + 1) || path;
