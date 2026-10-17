import { describe, expect, it } from 'vitest';
import { attachFollow, followNewContent, isFollowing, pinToBottom } from './follow';

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
    scrollTo: (value: number) => {
      feed.scrollTop = value;
      feed.dispatchEvent(new Event('scroll'));
    },
  };
};

describe('feed follow', () => {
  it('follows new content while the reader is at the bottom', () => {
    const { feed, grow } = feedWith(2000);
    attachFollow(feed);
    pinToBottom(feed);

    grow(300);
    followNewContent(feed);

    expect(feed.scrollTop).toBe(1800);
  });

  it('a wheel up stops following before the next token arrives', () => {
    const { feed, grow } = feedWith(2000);
    attachFollow(feed);
    pinToBottom(feed);

    feed.dispatchEvent(new WheelEvent('wheel', { deltaY: -40 }));
    grow(300);
    followNewContent(feed);

    expect(isFollowing(feed)).toBe(false);
    expect(feed.scrollTop).toBe(1500);
    expect(feed.classList.contains('reading')).toBe(true);
  });

  it('a small upward nudge near the bottom is never pulled back', () => {
    const { feed, grow, scrollTo } = feedWith(2000);
    attachFollow(feed);
    pinToBottom(feed);

    feed.dispatchEvent(new WheelEvent('wheel', { deltaY: -10 }));
    scrollTo(1480);
    grow(300);
    followNewContent(feed);

    expect(feed.scrollTop).toBe(1480);
  });

  it('scrolling back down to the bottom resumes following', () => {
    const { feed, grow, scrollTo } = feedWith(2000);
    attachFollow(feed);
    pinToBottom(feed);

    feed.dispatchEvent(new WheelEvent('wheel', { deltaY: -200 }));
    scrollTo(900);
    scrollTo(1495);
    grow(300);
    followNewContent(feed);

    expect(isFollowing(feed)).toBe(true);
    expect(feed.scrollTop).toBe(1800);
    expect(feed.classList.contains('reading')).toBe(false);
  });

  it('my own message pins even after scrolling up', () => {
    const { feed, scrollTo } = feedWith(2000);
    attachFollow(feed);

    feed.dispatchEvent(new WheelEvent('wheel', { deltaY: -200 }));
    scrollTo(200);
    pinToBottom(feed);

    expect(feed.scrollTop).toBe(1500);
    expect(isFollowing(feed)).toBe(true);
  });
});
