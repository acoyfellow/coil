import { describe, expect, it } from 'vitest';
import { attachFollow, followNewContent, isFollowing, pinToBottom } from './follow';

const VIEW = 500;

const feedWith = (contentHeight: number) => {
  const feed = document.createElement('div');
  let top = 0;

  Object.defineProperty(feed, 'clientHeight', { value: VIEW });
  Object.defineProperty(feed, 'scrollHeight', { get: () => contentHeight, configurable: true });
  Object.defineProperty(feed, 'scrollTop', {
    get: () => top,
    set: (value: number) => {
      top = Math.max(0, Math.min(value, contentHeight - VIEW));
    },
    configurable: true,
  });

  const scrollEvent = () => feed.dispatchEvent(new Event('scroll'));

  return {
    feed,
    token: (px = 20) => {
      contentHeight += px;
      followNewContent(feed);
      scrollEvent();
    },
    readerScrollsTo: (value: number) => {
      feed.scrollTop = value;
      scrollEvent();
    },
    bottom: () => contentHeight - VIEW,
  };
};

const frames = async () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

describe('basic scroll contract', () => {
  it('sticks to the bottom while text streams and the reader does not move', async () => {
    const s = feedWith(400);
    attachFollow(s.feed);

    for (let i = 0; i < 40; i++) s.token();
    await frames();

    expect(isFollowing(s.feed)).toBe(true);
    expect(s.feed.scrollTop).toBe(s.bottom());
  });

  it('a scrollbar drag up during streaming breaks away and stays where the reader put it', async () => {
    const s = feedWith(3000);
    attachFollow(s.feed);
    pinToBottom(s.feed);
    s.token();

    s.readerScrollsTo(1000);
    for (let i = 0; i < 30; i++) s.token();
    await frames();

    expect(isFollowing(s.feed)).toBe(false);
    expect(s.feed.classList.contains('reading')).toBe(true);
    expect(s.feed.scrollTop).toBe(1000);
  });

  it('a touch drag up during streaming breaks away', async () => {
    const s = feedWith(3000);
    attachFollow(s.feed);
    pinToBottom(s.feed);
    s.token();

    const touch = (type: string, y: number) => {
      const event = new Event(type) as Event & { touches: { clientY: number }[] };
      Object.defineProperty(event, 'touches', { value: [{ clientY: y }] });
      s.feed.dispatchEvent(event);
    };
    touch('touchstart', 100);
    touch('touchmove', 160);
    s.token();
    await frames();

    expect(isFollowing(s.feed)).toBe(false);
  });

  it('the reader can keep scrolling up through many tokens without being pulled back', async () => {
    const s = feedWith(5000);
    attachFollow(s.feed);
    pinToBottom(s.feed);

    for (let top = 4400; top >= 0; top -= 200) {
      s.readerScrollsTo(top);
      s.token();
    }
    await frames();

    expect(s.feed.scrollTop).toBe(0);
    expect(isFollowing(s.feed)).toBe(false);
  });

  it('scrolling back to the bottom resumes following, and the jump button pins', async () => {
    const s = feedWith(3000);
    attachFollow(s.feed);
    pinToBottom(s.feed);
    s.readerScrollsTo(1000);
    s.readerScrollsTo(s.bottom());
    s.token();
    await frames();

    expect(isFollowing(s.feed)).toBe(true);

    s.readerScrollsTo(500);
    pinToBottom(s.feed);
    s.token();
    await frames();

    expect(isFollowing(s.feed)).toBe(true);
    expect(s.feed.scrollTop).toBe(s.bottom());
  });

  it('short content that does not overflow never breaks following', () => {
    const s = feedWith(300);
    attachFollow(s.feed);
    s.feed.dispatchEvent(new WheelEvent('wheel', { deltaY: -40 }));
    s.token();

    expect(isFollowing(s.feed)).toBe(true);
  });
});
