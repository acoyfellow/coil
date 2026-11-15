import { describe, expect, test } from 'vitest';
import { edited, opened } from './editor-state';
import { addTab, closeTab, fuzzyFiles, noTabs, requestClose } from './editor-tabs';

describe('editor tabs', () => {
  test('adding an open path focuses it instead of duplicating', () => {
    const tabs = addTab(addTab(noTabs, opened('a.ts', '')), opened('b.ts', ''));
    const again = addTab(tabs, opened('a.ts', 'ignored'));

    expect(again.open.map((buffer) => buffer.path)).toEqual(['a.ts', 'b.ts']);
    expect(again.active).toBe('a.ts');
  });

  test('closing the active tab focuses the tab that slides into its place', () => {
    const tabs = ['a', 'b', 'c'].reduce((all, path) => addTab(all, opened(path, '')), noTabs);

    expect(closeTab({ ...tabs, active: 'b' }, 'b')).toMatchObject({ active: 'c' });
    expect(closeTab(tabs, 'c')).toMatchObject({ active: 'b' });
    expect(closeTab(addTab(noTabs, opened('a', '')), 'a')).toEqual({ open: [], active: null });
  });

  test('closing a dirty tab asks first; a clean tab closes at once', () => {
    const tabs = addTab(addTab(noTabs, opened('a', '1')), edited(opened('b', '1'), '2'));

    expect(requestClose(tabs, 'b')).toEqual({ kind: 'ask', path: 'b' });
    expect(requestClose(tabs, 'a')).toMatchObject({ kind: 'closed' });
  });
});

describe('editor fuzzy file match', () => {
  const files = ['README.md', 'client/src/update.ts', 'src/thread.ts', 'src/ui/style.ts'];

  test('matches on the file name first, then the path', () => {
    expect(fuzzyFiles(files, 'thr')[0]).toBe('src/thread.ts');
    expect(fuzzyFiles(files, 'upd')).toEqual(['client/src/update.ts']);
    expect(fuzzyFiles(files, 'srcui')).toEqual(['src/ui/style.ts']);
  });

  test('an empty query lists files in order; no match gives nothing', () => {
    expect(fuzzyFiles(files, '')).toEqual(files);
    expect(fuzzyFiles(files, 'zzz')).toEqual([]);
  });
});
