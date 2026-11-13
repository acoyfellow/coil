export const ASLEEP_CLASS = 'surface-asleep';

export const whenWanted = (
  host: HTMLElement,
  running: boolean,
  label: string,
  start: () => () => void,
): (() => void) => {
  if (running) return start();

  let stop: (() => void) | null = null;
  const cover = document.createElement('div');
  const wake = document.createElement('button');
  const note = document.createElement('span');

  cover.className = ASLEEP_CLASS;
  note.textContent = 'The computer is asleep. Chat does not need it.';
  wake.type = 'button';
  wake.textContent = label;
  wake.dataset.wake = '';
  wake.onclick = () => {
    cover.remove();
    stop = start();
  };
  cover.append(note, wake);
  host.replaceChildren(cover);

  return () => {
    stop?.();
  };
};
