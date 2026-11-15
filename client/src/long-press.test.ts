import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLongPress } from './long-press';

describe('long press', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires after 500 ms without movement', () => {
    const fired = vi.fn();
    const press = createLongPress(fired);

    press.start(10, 10);
    press.move(12, 13);
    vi.advanceTimersByTime(499);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('does not fire when moved 11 px', () => {
    const fired = vi.fn();
    const press = createLongPress(fired);

    press.start(0, 0);
    press.move(11, 0);
    vi.advanceTimersByTime(1000);
    expect(fired).not.toHaveBeenCalled();
  });

  it('does not fire when released early', () => {
    const fired = vi.fn();
    const press = createLongPress(fired);

    press.start(0, 0);
    vi.advanceTimersByTime(300);
    press.end();
    vi.advanceTimersByTime(1000);
    expect(fired).not.toHaveBeenCalled();
  });
});
