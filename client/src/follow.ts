export const FOLLOW_THRESHOLD_PX = 80;

const MOVE_EPSILON_PX = 2;

const following = new WeakMap<Element, boolean>();

const settledTop = new WeakMap<Element, number>();

export const distanceFromBottom = (feed: Element): number =>
  feed.scrollHeight - feed.clientHeight - feed.scrollTop;

export const isFollowing = (feed: Element): boolean => following.get(feed) ?? true;

const setFollowing = (feed: Element, value: boolean) => {
  following.set(feed, value);
  feed.classList.toggle('reading', !value);
};

const jumpToBottom = (feed: Element) => {
  feed.scrollTop = feed.scrollHeight;
  settledTop.set(feed, feed.scrollTop);
};

const jumpNowAndNextFrame = (feed: Element) => {
  jumpToBottom(feed);
  requestAnimationFrame(() => {
    if (isFollowing(feed)) jumpToBottom(feed);
  });
};

export const pinToBottom = (feed: Element) => {
  setFollowing(feed, true);
  jumpNowAndNextFrame(feed);
};

export const followNewContent = (feed: Element) => {
  if (isFollowing(feed)) jumpNowAndNextFrame(feed);
};

export const readerMoved = (feed: Element) => {
  const top = feed.scrollTop;
  const before = settledTop.get(feed) ?? top;

  settledTop.set(feed, top);

  if (top < before - MOVE_EPSILON_PX && distanceFromBottom(feed) > MOVE_EPSILON_PX) {
    setFollowing(feed, false);
    return;
  }

  if (top > before && distanceFromBottom(feed) <= FOLLOW_THRESHOLD_PX) setFollowing(feed, true);
};

export const attachFollow = (feed: HTMLElement): (() => void) => {
  let touchY: number | null = null;
  const canScrollUp = () => feed.scrollTop > 0;
  const release = (event: WheelEvent) => {
    if (event.deltaY < 0 && canScrollUp()) setFollowing(feed, false);
  };
  const track = () => readerMoved(feed);
  const releaseKeys = (event: KeyboardEvent) => {
    if (['PageUp', 'ArrowUp', 'Home'].includes(event.key) && canScrollUp())
      setFollowing(feed, false);
  };
  const touchStart = (event: TouchEvent) => {
    touchY = event.touches[0]?.clientY ?? null;
  };
  const touchMove = (event: TouchEvent) => {
    const y = event.touches[0]?.clientY;

    if (touchY !== null && y !== undefined && y > touchY + MOVE_EPSILON_PX && canScrollUp())
      setFollowing(feed, false);
  };
  const touchEnd = () => {
    touchY = null;
  };

  feed.addEventListener('wheel', release, { passive: true });
  feed.addEventListener('scroll', track, { passive: true });
  feed.addEventListener('keydown', releaseKeys);
  feed.addEventListener('touchstart', touchStart, { passive: true });
  feed.addEventListener('touchmove', touchMove, { passive: true });
  feed.addEventListener('touchend', touchEnd, { passive: true });
  settledTop.set(feed, feed.scrollTop);
  setFollowing(feed, true);

  return () => {
    feed.removeEventListener('wheel', release);
    feed.removeEventListener('scroll', track);
    feed.removeEventListener('keydown', releaseKeys);
    feed.removeEventListener('touchstart', touchStart);
    feed.removeEventListener('touchmove', touchMove);
    feed.removeEventListener('touchend', touchEnd);
  };
};
