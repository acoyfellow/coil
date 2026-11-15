export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 10;

export type LongPress = {
  readonly start: (x: number, y: number) => void;
  readonly move: (x: number, y: number) => void;
  readonly end: () => void;
};

export const createLongPress = (onFire: () => void): LongPress => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin = { x: 0, y: 0 };

  const end = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    start: (x, y) => {
      end();
      origin = { x, y };
      timer = setTimeout(() => {
        timer = null;
        onFire();
      }, LONG_PRESS_MS);
    },
    move: (x, y) => {
      if (timer !== null && Math.hypot(x - origin.x, y - origin.y) > LONG_PRESS_SLOP_PX) end();
    },
    end,
  };
};
