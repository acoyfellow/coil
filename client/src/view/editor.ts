import { Option } from 'effect';
import type { Html } from 'foldkit/html';
import { isDirty } from '../editor-state';
import { fuzzyFiles, tabLabel } from '../editor-tabs';
import { Message } from '../message';
import type { EditorBuffer, Model, QuickOpen } from '../model';
import { CodeEditor, MergeCompare } from '../mount';
import { type H, icon } from './parts';

type Editing = {
  readonly open: readonly EditorBuffer[];
  readonly active: string;
  readonly discard: string | null;
  readonly comparing: boolean;
};

const tabStrip = (h: H, file: Editing): Html =>
  h.div(
    [h.Class('editor-tabs'), h.Role('tablist'), h.AriaLabel('Open files')],
    file.open.map((buffer) =>
      h.keyed('div')(
        `etab-${buffer.path}`,
        [
          h.Class(`editor-tab${buffer.path === file.active ? ' on' : ''}`),
          h.Role('tab'),
          h.AriaSelected(buffer.path === file.active),
          h.Title(buffer.path),
          h.DataAttribute('path', buffer.path),
        ],
        [
          h.button(
            [h.Class('editor-tab-name'), h.OnClick(Message.FocusedTab({ path: buffer.path }))],
            [
              tabLabel(buffer.path),
              ...(isDirty(buffer)
                ? [h.span([h.Class('dirty-dot'), h.AriaLabel('Unsaved changes')], [])]
                : []),
            ],
          ),
          h.button(
            [
              h.Class('icon-btn editor-tab-close'),
              h.AriaLabel(`Close ${tabLabel(buffer.path)}`),
              h.OnClick(Message.RequestedCloseTab({ path: buffer.path })),
            ],
            [icon(h, 'close')],
          ),
        ],
      ),
    ),
  );

const editorBar = (h: H, buffer: EditorBuffer): Html =>
  h.div(
    [h.Class('editor-bar')],
    [
      h.span([h.Class('editor-path'), h.Title(buffer.path)], [buffer.path]),
      h.button(
        [
          h.Class('icon-btn'),
          h.Id('quick-open-button'),
          h.DataAttribute('tip', 'Open a file (⌘P)'),
          h.AriaLabel('Open a file'),
          h.OnClick(Message.OpenedQuickOpen()),
        ],
        [icon(h, 'search')],
      ),
      h.button(
        [
          h.Class('editor-save'),
          h.Id('editor-save'),
          h.DataAttribute('tip', 'Save (⌘S). Saving does not start the computer.'),
          h.Disabled(!isDirty(buffer) || buffer.saving || buffer.conflict !== null),
          h.OnClick(Message.RequestedSave({ path: buffer.path })),
        ],
        [buffer.saving ? 'Saving…' : isDirty(buffer) ? 'Save' : 'Saved'],
      ),
      h.button(
        [
          h.Class('icon-btn'),
          h.Id('editor-close'),
          h.AriaLabel('Close file'),
          h.OnClick(Message.RequestedCloseTab({ path: buffer.path })),
        ],
        [icon(h, 'close')],
      ),
    ],
  );

const conflictBar = (h: H, comparing: boolean): Html =>
  h.div(
    [h.Class('editor-conflict'), h.Role('alert')],
    [
      h.span([], ['The agent changed this file while you were editing.']),
      h.button(
        [h.Id('editor-compare'), h.OnClick(Message.ToggledCompare())],
        [comparing ? 'Hide changes' : 'Compare'],
      ),
      h.button([h.OnClick(Message.KeptMine())], ['Keep mine']),
      h.button([h.OnClick(Message.TookTheirs())], ['Take theirs']),
    ],
  );

const discardDialog = (h: H, path: string): Html =>
  h.div(
    [h.Class('editor-discard-backdrop')],
    [
      h.div(
        [
          h.Class('editor-discard'),
          h.Id('discard-dialog'),
          h.Role('alertdialog'),
          h.AriaModal(true),
          h.AriaLabel('Discard unsaved changes'),
        ],
        [
          h.p([], [`Discard unsaved changes to ${tabLabel(path)}?`]),
          h.div(
            [h.Class('editor-discard-actions')],
            [
              h.button(
                [h.Id('discard-keep'), h.OnClick(Message.CancelledDiscard())],
                ['Keep editing'],
              ),
              h.button(
                [h.Class('danger'), h.Id('discard-confirm'), h.OnClick(Message.ConfirmedDiscard())],
                ['Discard'],
              ),
            ],
          ),
        ],
      ),
    ],
  );

export const editorPane = (h: H, model: Model, file: Editing): Html => {
  const buffer = file.open.find((candidate) => candidate.path === file.active) ?? file.open[0];

  if (buffer === undefined) return null;

  const comparing = file.comparing && buffer.conflict !== null;

  return h.div(
    [h.Class('editor-pane')],
    [
      tabStrip(h, file),
      editorBar(h, buffer),
      ...(buffer.conflict === null ? [] : [conflictBar(h, comparing)]),
      comparing
        ? h.keyed('div')(
            `compare-${model.name ?? ''}-${buffer.path}`,
            [
              h.Class('editor-host editor-compare'),
              h.Id('editor-diff'),
              h.OnMount(
                MergeCompare({
                  path: buffer.path,
                  mine: buffer.text,
                  theirs: buffer.conflict ?? '',
                }),
              ),
            ],
            [],
          )
        : h.keyed('div')(
            `editor-${model.name ?? ''}-${buffer.path}`,
            [
              h.Class('editor-host'),
              h.Id('editor'),
              h.DataAttribute('path', buffer.path),
              h.OnMount(CodeEditor({ path: buffer.path, text: buffer.text })),
            ],
            [],
          ),
      ...(file.discard === null ? [] : [discardDialog(h, file.discard)]),
    ],
  );
};

const QUICK_KEYS: Record<string, Message> = {
  ArrowDown: Message.MovedQuickOpen({ delta: 1 }),
  ArrowUp: Message.MovedQuickOpen({ delta: -1 }),
  Escape: Message.ClosedQuickOpen(),
};

const quickList = (h: H, state: QuickOpen): Html => {
  if (state.files === null) return h.div([h.Class('palette-empty')], ['Listing files…']);

  const hits = fuzzyFiles(state.files, state.query);

  if (hits.length === 0) return h.div([h.Class('palette-empty')], ['No file matches.']);

  return h.div(
    [h.Class('palette-list'), h.Role('listbox')],
    hits.map((path, index) =>
      h.button(
        [
          h.Class(index === state.index ? 'on' : ''),
          h.Role('option'),
          h.AriaSelected(index === state.index),
          h.DataAttribute('path', path),
          h.OnClick(Message.ChoseQuickOpen({ index })),
        ],
        [h.span([], [tabLabel(path)]), h.span([h.Class('palette-hint')], [path])],
      ),
    ),
  );
};

export const quickOpen = (h: H, model: Model): Html => {
  const state = model.quickOpen;

  if (state === null) return null;

  return h.div(
    [h.Class('dialog-backdrop quick-open-backdrop'), h.OnClick(Message.ClosedQuickOpen())],
    [
      h.div(
        [
          h.Class('dialog palette'),
          h.Id('quick-open'),
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel('Open a file'),
          h.OnClick(Message.CompletedEffect(), { propagation: 'Stop' }),
        ],
        [
          h.input([
            h.Id('quick-open-input'),
            h.Placeholder('Open a file by name'),
            h.Autocomplete('off'),
            h.Value(state.query),
            h.OnInput((query) => Message.UpdatedQuickOpen({ query })),
            h.OnKeyDownPreventDefault((key) => {
              if (key === 'Enter')
                return Option.some(Message.ChoseQuickOpen({ index: state.index }));

              const mapped = QUICK_KEYS[key];

              return mapped === undefined ? Option.none() : Option.some(mapped);
            }),
          ]),
          quickList(h, state),
        ],
      ),
    ],
  );
};
