import { javascript } from '@codemirror/lang-javascript';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';

export type EditorEvents = {
  readonly changed: (text: string) => void;
  readonly save: () => void;
};

const LIVE = new WeakMap<HTMLElement, EditorView>();

const languageFor = (path: string): Extension[] => {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';

  if (['ts', 'tsx', 'mts', 'cts'].includes(extension))
    return [javascript({ typescript: true, jsx: extension === 'tsx' })];
  if (['js', 'jsx', 'mjs', 'cjs', 'json'].includes(extension))
    return [javascript({ jsx: extension === 'jsx' })];

  return [];
};

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'var(--bg)', color: 'var(--fg)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
    color: 'var(--faint)',
    borderRight: '1px solid var(--line)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--raise)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--raise)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--fg)' },
});

export const attachEditor = (
  host: HTMLElement,
  path: string,
  text: string,
  events: EditorEvents,
): (() => void) => {
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        theme,
        ...languageFor(path),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              events.save();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) events.changed(update.state.doc.toString());
        }),
      ],
    }),
  });

  LIVE.set(host, view);

  return () => {
    LIVE.delete(host);
    view.destroy();
  };
};

export const replaceText = (host: Element | null, text: string): boolean => {
  const view = host instanceof HTMLElement ? LIVE.get(host) : undefined;

  if (view === undefined) return false;
  if (view.state.doc.toString() === text) return true;

  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });

  return true;
};
