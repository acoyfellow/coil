import type { Folder, ThreadSummary } from '../../shared/protocol';

export const DAY_MS = 86_400_000;

export type Section =
  | {
      readonly kind: 'pinned';
      readonly key: string;
      readonly label: string;
      readonly threads: readonly ThreadSummary[];
    }
  | {
      readonly kind: 'folder';
      readonly key: string;
      readonly label: string;
      readonly folder: Folder;
      readonly threads: readonly ThreadSummary[];
    }
  | {
      readonly kind: 'recent';
      readonly key: string;
      readonly label: string;
      readonly threads: readonly ThreadSummary[];
    };

const startOfDay = (now: number) => {
  const day = new Date(now);

  day.setHours(0, 0, 0, 0);

  return day.getTime();
};

const recentBuckets = (now: number): readonly [string, (thread: ThreadSummary) => boolean][] => {
  const today = startOfDay(now);
  const yesterday = today - DAY_MS;
  const week = today - 6 * DAY_MS;

  return [
    ['Today', (thread) => thread.updatedAt >= today],
    ['Yesterday', (thread) => thread.updatedAt >= yesterday && thread.updatedAt < today],
    ['Previous 7 days', (thread) => thread.updatedAt >= week && thread.updatedAt < yesterday],
    ['Earlier', (thread) => thread.updatedAt < week],
  ];
};

export const folderKey = (id: string) => `folder:${id}`;

export const sectionsFor = (
  threads: readonly ThreadSummary[],
  folders: readonly Folder[],
  now: number,
  showEmptyFolders = true,
): Section[] => {
  const known = new Set(folders.map((folder) => folder.id));
  const inFolder = (thread: ThreadSummary) =>
    thread.folder !== undefined && thread.folder !== null && known.has(thread.folder);
  const pinned = threads.filter((thread) => thread.pinned === true && !inFolder(thread));
  const loose = threads.filter((thread) => thread.pinned !== true && !inFolder(thread));
  const sorted = [...folders].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

  return [
    ...(pinned.length === 0
      ? []
      : [{ kind: 'pinned' as const, key: 'group:Pinned', label: 'Pinned', threads: pinned }]),
    ...sorted.flatMap((folder) => {
      const members = threads.filter((thread) => thread.folder === folder.id);

      return members.length === 0 && !showEmptyFolders
        ? []
        : [
            {
              kind: 'folder' as const,
              key: folderKey(folder.id),
              label: folder.name,
              folder,
              threads: members,
            },
          ];
    }),
    ...recentBuckets(now).flatMap(([label, belongs]) => {
      const members = loose.filter(belongs);

      return members.length === 0
        ? []
        : [{ kind: 'recent' as const, key: `group:${label}`, label, threads: members }];
    }),
  ];
};

export const orderBetween = (before: number | null, after: number | null): number => {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;

  return (before + after) / 2;
};

export const orderForDrop = (
  folders: readonly Folder[],
  dragged: string,
  target: string,
  place: 'before' | 'after',
): number => {
  const rest = [...folders]
    .filter((folder) => folder.id !== dragged)
    .sort((a, b) => a.order - b.order);
  const index = rest.findIndex((folder) => folder.id === target);

  if (index === -1) return rest.at(-1) === undefined ? 1 : (rest.at(-1) as Folder).order + 1;

  const at = place === 'before' ? index : index + 1;

  return orderBetween(rest[at - 1]?.order ?? null, rest[at]?.order ?? null);
};

export const liveCount = (threads: readonly ThreadSummary[]) => ({
  busy: threads.filter((thread) => thread.busy || thread.looping).length,
  failed: threads.filter((thread) => thread.failed === true).length,
});
