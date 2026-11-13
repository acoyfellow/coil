import { describe, expect, it } from 'vitest';
import type { Folder, ThreadSummary } from '../../shared/protocol';
import { DAY_MS, liveCount, orderBetween, orderForDrop, sectionsFor } from './folders';

const NOW = new Date(2026, 10, 13, 15, 0, 0).getTime();

const thread = (name: string, extra: Partial<ThreadSummary> = {}): ThreadSummary => ({
  name,
  title: name,
  phase: 'new',
  busy: false,
  repo: null,
  parent: null,
  forkedFrom: null,
  createdBy: 'web',
  owner: 'me',
  createdAt: NOW,
  updatedAt: NOW,
  archived: false,
  model: '',
  looping: false,
  ...extra,
});

const folder = (id: string, name: string, order: number): Folder => ({
  id,
  name,
  order,
  createdAt: 0,
});

const shape = (sections: ReturnType<typeof sectionsFor>) =>
  sections.map((section) => [section.label, section.threads.map((t) => t.name)]);

describe('sidebar sections', () => {
  it('pinned on top, then folders in order, then recent by day', () => {
    const folders = [folder('b', 'Customer0', 2), folder('a', 'Coil', 1)];
    const threads = [
      thread('pin', { pinned: true }),
      thread('scroll', { folder: 'a' }),
      thread('broker', { folder: 'a' }),
      thread('c0', { folder: 'b' }),
      thread('today'),
      thread('old', { updatedAt: NOW - 30 * DAY_MS }),
      thread('yday', { updatedAt: NOW - DAY_MS }),
    ];

    expect(shape(sectionsFor(threads, folders, NOW))).toEqual([
      ['Pinned', ['pin']],
      ['Coil', ['scroll', 'broker']],
      ['Customer0', ['c0']],
      ['Today', ['today']],
      ['Yesterday', ['yday']],
      ['Earlier', ['old']],
    ]);
  });

  it('a thread shows in exactly one place: a pinned thread in a folder stays in its folder', () => {
    const sections = sectionsFor(
      [thread('x', { pinned: true, folder: 'a' }), thread('y')],
      [folder('a', 'Coil', 1)],
      NOW,
    );
    const all = sections.flatMap((section) => section.threads.map((t) => t.name));

    expect(all).toEqual(['x', 'y']);
    expect(shape(sections)[0]).toEqual(['Coil', ['x']]);
  });

  it('a thread pointing at a deleted folder falls back to recent', () => {
    expect(shape(sectionsFor([thread('lost', { folder: 'gone' })], [], NOW))).toEqual([
      ['Today', ['lost']],
    ]);
  });

  it('an empty folder still shows so it can take a drop', () => {
    expect(shape(sectionsFor([], [folder('a', 'Empty', 1)], NOW))).toEqual([['Empty', []]]);
    expect(sectionsFor([], [folder('a', 'Empty', 1)], NOW, false)).toEqual([]);
  });

  it('counts running and failed threads so a collapsed folder still signals', () => {
    expect(
      liveCount([
        thread('a', { busy: true }),
        thread('b', { looping: true }),
        thread('c', { failed: true }),
      ]),
    ).toEqual({ busy: 2, failed: 1 });
  });
});

describe('folder order', () => {
  it('a drop between two folders lands between their orders, without renumbering', () => {
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(null, 1)).toBe(0);
    expect(orderBetween(3, null)).toBe(4);
    expect(orderBetween(null, null)).toBe(1);
  });

  it('dropping a folder before or after another gives the right slot', () => {
    const folders = [folder('a', 'A', 1), folder('b', 'B', 2), folder('c', 'C', 3)];

    expect(orderForDrop(folders, 'c', 'a', 'before')).toBe(0);
    expect(orderForDrop(folders, 'c', 'a', 'after')).toBe(1.5);
    expect(orderForDrop(folders, 'a', 'c', 'after')).toBe(4);
    expect(orderForDrop(folders, 'a', 'b', 'after')).toBe(2.5);
  });
});
