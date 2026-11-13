import type { EditorEvents } from './editor';

const load = () => import('./editor');

export const attachEditorLazy = (
  host: HTMLElement,
  path: string,
  text: string,
  events: EditorEvents,
): (() => void) => {
  let detach: (() => void) | null = null;
  let gone = false;

  void load().then((editor) => {
    if (!gone) detach = editor.attachEditor(host, path, text, events);
  });

  return () => {
    gone = true;
    detach?.();
  };
};

export const replaceTextLazy = (host: Element | null, text: string): Promise<boolean> =>
  load().then((editor) => editor.replaceText(host, text));
