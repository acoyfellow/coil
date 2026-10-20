import { afterEach, describe, expect, test, vi } from 'vitest';
import { reloadWhenSafe } from './shell-update';

describe('a new app version', () => {
  afterEach(() => vi.restoreAllMocks());

  test('reloads at once when nothing is being typed', () => {
    const reload = vi.fn();

    reloadWhenSafe(reload, () => true);

    expect(reload).toHaveBeenCalledOnce();
  });

  test('waits for the app to be hidden when a draft is in the composer', () => {
    const reload = vi.fn();
    let state: DocumentVisibilityState = 'visible';

    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
    reloadWhenSafe(reload, () => false);

    expect(reload).not.toHaveBeenCalled();

    state = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    expect(reload).toHaveBeenCalledOnce();
  });
});
