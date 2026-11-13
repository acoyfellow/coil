import { describe, expect, it } from 'vitest';
import {
  diskChanged,
  edited,
  isDirty,
  keptMine,
  opened,
  planSave,
  saved,
  savingStarted,
  tookTheirs,
} from './editor-state';

describe('editor buffer', () => {
  it('is clean when opened, dirty after an edit, clean again after a save', () => {
    const buffer = opened('a.ts', 'one');

    expect(isDirty(buffer)).toBe(false);
    expect(isDirty(edited(buffer, 'two'))).toBe(true);
    expect(isDirty(saved(edited(buffer, 'two'), 'two'))).toBe(false);
  });

  it('typing back to the saved text is clean', () => {
    expect(isDirty(edited(edited(opened('a', 'x'), 'xy'), 'x'))).toBe(false);
  });

  it('plans a write only for a dirty, idle, unconflicted buffer', () => {
    const dirty = edited(opened('a', 'x'), 'y');

    expect(planSave(opened('a', 'x'))).toEqual({ kind: 'nothing' });
    expect(planSave(dirty)).toEqual({ kind: 'write', text: 'y' });
    expect(planSave(savingStarted(dirty))).toEqual({ kind: 'nothing' });
  });

  it('reloads silently when the agent changes a file the user has not touched', () => {
    const change = diskChanged(opened('a', 'old'), 'agent');

    expect(change.kind).toBe('reload');
    expect(change.kind === 'reload' && change.buffer.text).toBe('agent');
  });

  it('ignores a disk change that matches what the user already has', () => {
    expect(diskChanged(opened('a', 'same'), 'same').kind).toBe('same');
    expect(diskChanged(edited(opened('a', 'x'), 'y'), 'y').kind).toBe('reload');
  });

  it('never overwrites unsaved work: a disk change on a dirty buffer is a conflict that blocks save', () => {
    const change = diskChanged(edited(opened('a', 'base'), 'mine'), 'theirs');

    expect(change.kind).toBe('conflict');
    if (change.kind !== 'conflict') return;
    expect(change.buffer.text).toBe('mine');
    expect(planSave(change.buffer).kind).toBe('blocked');
  });

  it('keep mine makes the disk the new base so the next save overwrites on purpose', () => {
    const change = diskChanged(edited(opened('a', 'base'), 'mine'), 'theirs');

    if (change.kind !== 'conflict') throw new Error('expected conflict');
    const kept = keptMine(change.buffer);

    expect(kept.text).toBe('mine');
    expect(kept.base).toBe('theirs');
    expect(planSave(kept)).toEqual({ kind: 'write', text: 'mine' });
  });

  it('take theirs drops the local edit and shows the disk', () => {
    const change = diskChanged(edited(opened('a', 'base'), 'mine'), 'theirs');

    if (change.kind !== 'conflict') throw new Error('expected conflict');
    const taken = tookTheirs(change.buffer);

    expect(taken.text).toBe('theirs');
    expect(isDirty(taken)).toBe(false);
  });
});
