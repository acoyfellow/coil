import { describe, expect, it } from 'vitest';
import { attachFollow, isFollowing, pinToBottom } from './follow';

const feedWith = (contentHeight: number) => {
  const feed = document.createElement('div');
  let top = 0;

  Object.defineProperty(feed, 'clientHeight', { value: 500 });
  Object.defineProperty(feed, 'scrollHeight', { get: () => contentHeight, configurable: true });
  Object.defineProperty(feed, 'scrollTop', {
    get: () => top,
    set: (value: number) => {
      top = Math.max(0, Math.min(value, contentHeight - 500));
    },
    configurable: true,
  });

  return {
    feed,
    grow: (by: number) => {
      contentHeight += by;
    },
  };
};

const nextFrames = async () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

describe('feed follow mechanisms', () => {
  it('a programmatic jump is not mistaken for user scroll-up', async () => {
    const { feed } = feedWith(2000);
    attachFollow(feed);
    pinToBottom(feed);
    await nextFrames();

    expect(isFollowing(feed)).toBe(true);
    expect(feed.scrollTop).toBe(1500);
  });

  it('a late scroll event during a pin does not flip off following', async () => {
    const { feed } = feedWith(2000);
    attachFollow(feed);
    pinToBottom(feed);
    feed.dispatchEvent(new Event('scroll'));
    await nextFrames();

    expect(isFollowing(feed)).toBe(true);
  });

  it('pins again on the next frame after content grows', async () => {
    const { feed, grow } = feedWith(2000);
    attachFollow(feed);
    pinToBottom(feed);
    grow(400);
    await nextFrames();

    expect(feed.scrollTop).toBe(1900);
  });
});
