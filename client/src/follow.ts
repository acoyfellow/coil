export const FOLLOW_THRESHOLD_PX = 80;

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

export const pinToBottom = (feed: Element) => {
  setFollowing(feed, true);
  jumpToBottom(feed);
};

export const followNewContent = (feed: Element) => {
  if (isFollowing(feed)) jumpToBottom(feed);
};

export const attachFollow = (feed: HTMLElement): (() => void) => {
  const release = (event: WheelEvent) => {
    if (event.deltaY < 0) setFollowing(feed, false);
  };
  const track = () => {
    const movedDown = feed.scrollTop > (settledTop.get(feed) ?? feed.scrollTop);
    const near = distanceFromBottom(feed) <= FOLLOW_THRESHOLD_PX;

    settledTop.set(feed, feed.scrollTop);
    if (!near) setFollowing(feed, false);
    else if (movedDown) setFollowing(feed, true);
  };
  const releaseKeys = (event: KeyboardEvent) => {
    if (['PageUp', 'ArrowUp', 'Home'].includes(event.key)) setFollowing(feed, false);
  };

  feed.addEventListener('wheel', release, { passive: true });
  feed.addEventListener('scroll', track, { passive: true });
  feed.addEventListener('keydown', releaseKeys);
  settledTop.set(feed, feed.scrollTop);
  setFollowing(feed, true);

  return () => {
    feed.removeEventListener('wheel', release);
    feed.removeEventListener('scroll', track);
    feed.removeEventListener('keydown', releaseKeys);
  };
};
