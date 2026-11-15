import { javascript } from '@codemirror/lang-javascript';
import { LanguageSupport, StreamLanguage, type StreamParser } from '@codemirror/language';
import { unifiedMergeView } from '@codemirror/merge';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';

export type EditorEvents = {
  readonly changed: (text: string) => void;
  readonly save: () => void;
};

const LIVE = new WeakMap<HTMLElement, EditorView>();

const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();

  if (name === 'dockerfile') return 'dockerfile';

  return name.includes('.') ? (name.split('.').pop() ?? '') : '';
};

const stream = async (load: () => Promise<StreamParser<unknown>>): Promise<Extension> =>
  new LanguageSupport(StreamLanguage.define(await load()));

const shell = () => stream(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell);

const LOADERS: Record<string, () => Promise<Extension>> = {
  css: async () => (await import('@codemirror/lang-css')).css(),
  scss: async () => (await import('@codemirror/lang-css')).css(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  htm: async () => (await import('@codemirror/lang-html')).html(),
  svelte: async () => (await import('@codemirror/lang-html')).html(),
  json: async () => (await import('@codemirror/lang-json')).json(),
  jsonc: async () => (await import('@codemirror/lang-json')).json(),
  md: async () => (await import('@codemirror/lang-markdown')).markdown(),
  markdown: async () => (await import('@codemirror/lang-markdown')).markdown(),
  py: async () => (await import('@codemirror/lang-python')).python(),
  yaml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  yml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  sh: shell,
  bash: shell,
  zsh: shell,
  toml: () => stream(async () => (await import('@codemirror/legacy-modes/mode/toml')).toml),
  dockerfile: () =>
    stream(async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile),
  go: () => stream(async () => (await import('@codemirror/legacy-modes/mode/go')).go),
  rs: () => stream(async () => (await import('@codemirror/legacy-modes/mode/rust')).rust),
};

const immediateLanguage = (path: string): Extension[] => {
  const extension = extensionOf(path);

  if (['ts', 'tsx', 'mts', 'cts'].includes(extension))
    return [javascript({ typescript: true, jsx: extension === 'tsx' })];
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension))
    return [javascript({ jsx: extension === 'jsx' })];

  return [];
};

const loadLanguage = (view: EditorView, slot: Compartment, path: string): void => {
  const loader = LOADERS[extensionOf(path)];

  if (loader === undefined) return;

  void loader()
    .then((language) => view.dispatch({ effects: slot.reconfigure(language) }))
    .catch(() => undefined);
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
  const slot = new Compartment();
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        theme,
        slot.of(immediateLanguage(path)),
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
  loadLanguage(view, slot, path);

  return () => {
    LIVE.delete(host);
    view.destroy();
  };
};

export const attachCompare = (
  host: HTMLElement,
  path: string,
  mine: string,
  theirs: string,
): (() => void) => {
  const slot = new Compartment();
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: theirs,
      extensions: [
        basicSetup,
        theme,
        slot.of(immediateLanguage(path)),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        unifiedMergeView({ original: mine, mergeControls: false, gutter: true }),
      ],
    }),
  });

  loadLanguage(view, slot, path);

  return () => view.destroy();
};

export const replaceText = (host: Element | null, text: string): boolean => {
  const view = host instanceof HTMLElement ? LIVE.get(host) : undefined;

  if (view === undefined) return false;
  if (view.state.doc.toString() === text) return true;

  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });

  return true;
};
