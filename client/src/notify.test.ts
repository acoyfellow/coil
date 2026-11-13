import { describe, expect, it } from 'vitest';
import type { ThreadSummary } from '../../shared/protocol';
import { finishedThreads } from './notify';

const t = (name: string, busy: boolean, looping = false): ThreadSummary => ({
  name,
  title: `T ${name}`,
  phase: 'awake',
  busy,
  repo: null,
  parent: null,
  forkedFrom: null,
  createdBy: 'web',
  owner: 'o',
  createdAt: 0,
  updatedAt: 0,
  archived: false,
  model: '',
  looping,
});

describe('notifications', () => {
  it('fires when a working thread goes idle, and once when a loop ends', () => {
    expect(finishedThreads([t('a', true), t('b', false)], [t('a', false), t('b', false)])).toEqual([
      { name: 'a', title: 'T a', why: 'turn' },
    ]);
    expect(finishedThreads([t('l', true, true)], [t('l', false, true)])).toEqual([]);
    expect(finishedThreads([t('l', false, true)], [t('l', false, false)])).toEqual([
      { name: 'l', title: 'T l', why: 'loop' },
    ]);
    expect(finishedThreads([], [t('new', false)])).toEqual([]);
  });
});
