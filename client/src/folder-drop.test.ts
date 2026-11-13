import { describe, expect, it } from 'vitest';
import type { Folder, ThreadSummary } from '../../shared/protocol';
import { dropPlan, folderTarget, NEW_FOLDER_TARGET, RECENT_TARGET } from './folder-drop';

const folders: Folder[] = [
  { id: 'a', name: 'Coil', order: 1, createdAt: 0 },
  { id: 'b', name: 'Customer0', order: 2, createdAt: 0 },
];

const thread = (name: string, folder: string | null = null): ThreadSummary => ({
  name,
  title: name,
  phase: 'new',
  busy: false,
  repo: null,
  parent: null,
  forkedFrom: null,
  createdBy: 'web',
  owner: 'me',
  createdAt: 0,
  updatedAt: 0,
  archived: false,
  model: '',
  looping: false,
  folder,
});

const threads = [thread('loose'), thread('filed', 'a')];

describe('drop plan', () => {
  it('a thread dropped on a folder moves into it', () => {
    expect(
      dropPlan({ kind: 'thread', id: 'loose' }, folderTarget('b'), 'into', folders, threads),
    ).toEqual({
      _tag: 'FileThread',
      name: 'loose',
      folder: 'b',
      label: 'Customer0',
    });
  });

  it('a filed thread dropped on Recent leaves its folder; a loose one does nothing', () => {
    expect(
      dropPlan({ kind: 'thread', id: 'filed' }, RECENT_TARGET, 'into', folders, threads),
    ).toMatchObject({
      _tag: 'FileThread',
      folder: null,
    });
    expect(
      dropPlan({ kind: 'thread', id: 'loose' }, RECENT_TARGET, 'into', folders, threads),
    ).toEqual({
      _tag: 'None',
    });
  });

  it('a thread dropped on its own folder does nothing', () => {
    expect(
      dropPlan({ kind: 'thread', id: 'filed' }, folderTarget('a'), 'into', folders, threads),
    ).toEqual({
      _tag: 'None',
    });
  });

  it('a thread dropped on the new-folder slot asks for a folder', () => {
    expect(
      dropPlan({ kind: 'thread', id: 'loose' }, NEW_FOLDER_TARGET, 'into', folders, threads),
    ).toEqual({
      _tag: 'NewFolder',
      name: 'loose',
    });
  });

  it('a folder dropped on another folder reorders before it, never nests', () => {
    expect(
      dropPlan({ kind: 'folder', id: 'b' }, folderTarget('a'), 'before', folders, threads),
    ).toEqual({
      _tag: 'MoveFolder',
      id: 'b',
      order: 0,
    });
    expect(
      dropPlan({ kind: 'folder', id: 'b' }, folderTarget('a'), 'into', folders, threads),
    ).toEqual({
      _tag: 'None',
    });
    expect(
      dropPlan({ kind: 'folder', id: 'a' }, folderTarget('a'), 'before', folders, threads),
    ).toEqual({
      _tag: 'None',
    });
  });

  it('nothing happens with no drag or an unknown target', () => {
    expect(dropPlan(null, folderTarget('a'), 'into', folders, threads)).toEqual({ _tag: 'None' });
    expect(
      dropPlan({ kind: 'thread', id: 'loose' }, folderTarget('zzz'), 'into', folders, threads),
    ).toEqual({
      _tag: 'None',
    });
  });
});
