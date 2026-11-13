import type { Model } from './model';

export type MoveChoice =
  | { readonly _tag: 'Folder'; readonly folder: string; readonly label: string }
  | { readonly _tag: 'Recent'; readonly folder: null; readonly label: string }
  | { readonly _tag: 'Create'; readonly label: string };

const threadFolder = (model: Model, name: string): string | null => {
  const threads = model.threads._tag === 'Ready' ? model.threads.value : [];

  return threads.find((thread) => thread.name === name)?.folder ?? null;
};

const score = (label: string, needle: string): number => {
  const text = label.toLowerCase();

  if (needle === '') return 1;
  if (text === needle) return 4;
  if (text.startsWith(needle)) return 3;
  if (text.split(/\s+/).some((word) => word.startsWith(needle))) return 2;

  return text.includes(needle) ? 1 : 0;
};

export const moveChoices = (model: Model, name: string, query: string): MoveChoice[] => {
  const needle = query.trim().toLowerCase();
  const current = threadFolder(model, name);
  const folders = [...model.folders]
    .sort((a, b) => a.order - b.order)
    .filter((folder) => folder.id !== current)
    .map((folder) => ({ folder, rank: score(folder.name, needle) }))
    .filter(({ rank }) => rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map(({ folder }): MoveChoice => ({ _tag: 'Folder', folder: folder.id, label: folder.name }));
  const recent: MoveChoice[] =
    current !== null && score('Recent', needle) > 0
      ? [{ _tag: 'Recent', folder: null, label: 'Recent' }]
      : [];
  const exact = model.folders.some((folder) => folder.name.toLowerCase() === needle);
  const create: MoveChoice[] =
    needle !== '' && !exact ? [{ _tag: 'Create', label: query.trim() }] : [];

  return [...folders, ...recent, ...create];
};
