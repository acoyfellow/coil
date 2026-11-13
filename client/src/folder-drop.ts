import type { Folder, ThreadSummary } from '../../shared/protocol';
import { orderForDrop } from './folders';

export type Drag = { readonly kind: 'thread' | 'folder'; readonly id: string };

export type DropPlace = 'into' | 'before' | 'after';

export const RECENT_TARGET = 'recent';
export const NEW_FOLDER_TARGET = 'new-folder';

export const folderTarget = (id: string) => `folder:${id}`;

export type DropPlan =
  | { readonly _tag: 'None' }
  | {
      readonly _tag: 'FileThread';
      readonly name: string;
      readonly folder: string | null;
      readonly label: string;
    }
  | { readonly _tag: 'NewFolder'; readonly name: string }
  | { readonly _tag: 'MoveFolder'; readonly id: string; readonly order: number };

const NONE: DropPlan = { _tag: 'None' };

const targetFolder = (target: string, folders: readonly Folder[]): Folder | null => {
  if (!target.startsWith('folder:')) return null;

  const id = target.slice('folder:'.length);

  return folders.find((folder) => folder.id === id) ?? null;
};

export const dropPlan = (
  drag: Drag | null,
  target: string,
  place: DropPlace,
  folders: readonly Folder[],
  threads: readonly ThreadSummary[],
): DropPlan => {
  if (drag === null) return NONE;

  if (drag.kind === 'thread') {
    const thread = threads.find((each) => each.name === drag.id);

    if (thread === undefined) return NONE;

    const current = thread.folder ?? null;

    if (target === NEW_FOLDER_TARGET) return { _tag: 'NewFolder', name: thread.name };

    if (target === RECENT_TARGET)
      return current === null
        ? NONE
        : { _tag: 'FileThread', name: thread.name, folder: null, label: 'Recent' };

    const folder = targetFolder(target, folders);

    if (folder === null || folder.id === current) return NONE;

    return { _tag: 'FileThread', name: thread.name, folder: folder.id, label: folder.name };
  }

  const folder = targetFolder(target, folders);

  if (folder === null || folder.id === drag.id || place === 'into') return NONE;

  const order = orderForDrop(folders, drag.id, folder.id, place);
  const dragged = folders.find((each) => each.id === drag.id);

  return dragged === undefined || dragged.order === order
    ? NONE
    : { _tag: 'MoveFolder', id: drag.id, order };
};
