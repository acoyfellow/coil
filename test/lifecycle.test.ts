import { describe, expect, it } from 'vitest';
import { lifecycleOf } from '../src/lifecycle';

describe('lifecycleOf', () => {
  it('reports new, awake, and paused unchanged when idle', () => {
    expect(lifecycleOf({ phase: 'new', busy: false, compacting: false, wakeError: '' })).toBe(
      'new',
    );
    expect(lifecycleOf({ phase: 'awake', busy: false, compacting: false, wakeError: '' })).toBe(
      'awake',
    );
    expect(lifecycleOf({ phase: 'paused', busy: false, compacting: false, wakeError: '' })).toBe(
      'paused',
    );
  });

  it('prefers compacting over working', () => {
    expect(lifecycleOf({ phase: 'awake', busy: true, compacting: true, wakeError: '' })).toBe(
      'compacting',
    );
  });

  it('reports working when busy', () => {
    expect(lifecycleOf({ phase: 'awake', busy: true, compacting: false, wakeError: '' })).toBe(
      'working',
    );
  });

  it('reports failed over phase when the last wake failed', () => {
    expect(
      lifecycleOf({ phase: 'paused', busy: false, compacting: false, wakeError: 'boom' }),
    ).toBe('failed');
  });

  it('working wins over failed', () => {
    expect(lifecycleOf({ phase: 'paused', busy: true, compacting: false, wakeError: 'boom' })).toBe(
      'working',
    );
  });
});
