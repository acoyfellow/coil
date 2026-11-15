import { Command, given, message, model, story } from 'foldkit/story';
import { describe, expect, test } from 'vitest';
import type { ThreadView } from '../../shared/protocol';
import {
  CheckDisk,
  ExpireToast,
  FocusQuickOpen,
  ListWorkspaceFiles,
  LoadFile,
  PushEditorText,
  RefreshViewSoon,
  SaveFile,
} from './command';
import { initialModel } from './main';
import { Message } from './message';
import { FileView, type Model, ViewState } from './model';
import { update } from './update';

const thread: ThreadView = {
  name: 'demo',
  title: 'Demo',
  phase: 'paused',
  busy: false,
  running: false,
  repo: null,
  origin: { parent: null, forkedFrom: null, base: null, seed: null },
  owner: 'you@example.com',
  size: 'standard-1',
  messages: [],
  pairs: [],
  execs: [],
  surfaces: [],
  model: '@cf/zai-org/glm-5.3',
  usage: { input: 0, output: 0, cacheRead: 0, cost: 0, contextTokens: 0, contextWindow: 1048576 },
  turns: [],
};

const editing = (): Model => ({
  ...initialModel({ name: 'demo', now: 1_000, online: true, theme: 'system', openNew: false }),
  view: ViewState.Ready({ value: thread }),
  tab: 'files',
});

const buffer = (current: Model) => {
  const file = current.file;

  return file._tag === 'Editing'
    ? (file.open.find((open) => open.path === file.active) ?? null)
    : null;
};

const tabPaths = (current: Model) =>
  current.file._tag === 'Editing' ? current.file.open.map((open) => open.path) : [];

const activePath = (current: Model) =>
  current.file._tag === 'Editing' ? current.file.active : null;

const discardPrompt = (current: Model) =>
  current.file._tag === 'Editing' ? current.file.discard : null;

const toolEnd = Message.ReceivedEvent({
  name: 'demo',
  event: { _tag: 'tool_end', id: 'x', name: 'write' },
});

describe('the editor, told as stories', () => {
  test('open, type, save: the save writes the typed text and the buffer is clean again', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.EditedFile({ path: 'a.ts', text: 'two' })),
      message(Message.RequestedSave({ path: 'a.ts' })),
      model((current) => expect(buffer(current)?.saving).toBe(true)),
      Command.expectHas(SaveFile),
      Command.resolve(SaveFile, Message.SavedFile({ name: 'demo', path: 'a.ts', text: 'two' })),
      model((current) => {
        expect(buffer(current)?.base).toBe('two');
        expect(buffer(current)?.saving).toBe(false);
      }),
    );
  });

  test('the agent edits a file the user has open but not touched: the editor reloads', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(toolEnd),
      Command.expectHas(CheckDisk),
      Command.resolve(RefreshViewSoon, Message.FailedView({ name: 'other', reason: 'skip' })),
      Command.resolve(
        CheckDisk,
        Message.CheckedDisk({ name: 'demo', path: 'a.ts', text: 'agent' }),
      ),
      Command.resolve(PushEditorText, Message.CompletedEffect()),
      model((current) => {
        expect(buffer(current)?.text).toBe('agent');
        expect(buffer(current)?.conflict).toBeNull();
      }),
    );
  });

  test('the agent edits a file the user is changing: no overwrite, a conflict that blocks save', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.EditedFile({ path: 'a.ts', text: 'mine' })),
      message(toolEnd),
      Command.resolve(RefreshViewSoon, Message.FailedView({ name: 'other', reason: 'skip' })),
      Command.resolve(
        CheckDisk,
        Message.CheckedDisk({ name: 'demo', path: 'a.ts', text: 'agent' }),
      ),
      model((current) => {
        expect(buffer(current)?.text).toBe('mine');
        expect(buffer(current)?.conflict).toBe('agent');
      }),
      message(Message.RequestedSave({ path: 'a.ts' })),
      Command.expectExact(ExpireToast),
      model((current) => {
        expect(current.toasts.at(-1)?.text).toContain('changed on disk');
        expect(buffer(current)?.saving).toBe(false);
      }),
      Command.resolve(ExpireToast, Message.ExpiredToast({ id: 1 })),
      message(Message.KeptMine()),
      message(Message.RequestedSave({ path: 'a.ts' })),
      Command.expectHas(SaveFile),
      Command.resolve(SaveFile, Message.SavedFile({ name: 'demo', path: 'a.ts', text: 'mine' })),
    );
  });

  test('a save result for a file that is no longer open changes nothing', () => {
    story(
      update,
      given({ ...editing(), file: FileView.Closed() }),
      message(Message.SavedFile({ name: 'demo', path: 'a.ts', text: 'two' })),
      model((current) => expect(current.file._tag).toBe('Closed')),
    );
  });
  test('closing a clean file closes the modal at once', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.RequestedCloseFile()),
      Command.expectNone(),
      model((current) => expect(current.file._tag).toBe('Closed')),
    );
  });

  test('Escape closes the file modal before it stops anything', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.PressedShortcut({ key: 'stop' })),
      model((current) => expect(current.file._tag).toBe('Closed')),
    );
  });

  test('editor discard dialog: closing unsaved edits asks in-app; Keep editing keeps them', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.EditedFile({ path: 'a.ts', text: 'two' })),
      message(Message.RequestedCloseFile()),
      Command.expectNone(),
      model((current) => expect(discardPrompt(current)).toBe('a.ts')),
      message(Message.CancelledDiscard()),
      model((current) => {
        expect(discardPrompt(current)).toBeNull();
        expect(buffer(current)?.text).toBe('two');
      }),
      message(Message.RequestedCloseFile()),
      message(Message.PressedShortcut({ key: 'stop' })),
      model((current) => {
        expect(discardPrompt(current)).toBeNull();
        expect(current.file._tag).toBe('Editing');
      }),
      message(Message.RequestedCloseFile()),
      message(Message.ConfirmedDiscard()),
      model((current) => expect(current.file._tag).toBe('Closed')),
    );
  });

  test('editor tabs: two files open as tabs, clicking an open file focuses its tab', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.ClickedFile({ path: 'notes/b.md' })),
      Command.expectExact(LoadFile),
      model((current) => expect(activePath(current)).toBe('a.ts')),
      Command.resolve(
        LoadFile,
        Message.LoadedFile({ name: 'demo', path: 'notes/b.md', text: '# b' }),
      ),
      model((current) => {
        expect(tabPaths(current)).toEqual(['a.ts', 'notes/b.md']);
        expect(activePath(current)).toBe('notes/b.md');
      }),
      message(Message.ClickedFile({ path: 'a.ts' })),
      Command.expectNone(),
      model((current) => {
        expect(activePath(current)).toBe('a.ts');
        expect(tabPaths(current)).toHaveLength(2);
      }),
      message(Message.FocusedTab({ path: 'notes/b.md' })),
      model((current) => expect(buffer(current)?.text).toBe('# b')),
    );
  });

  test('editor tabs: Discard closes only the dirty tab and focuses its neighbour', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.LoadedFile({ name: 'demo', path: 'b.ts', text: 'bee' })),
      message(Message.EditedFile({ path: 'b.ts', text: 'changed' })),
      message(Message.RequestedCloseTab({ path: 'b.ts' })),
      model((current) => expect(discardPrompt(current)).toBe('b.ts')),
      message(Message.ConfirmedDiscard()),
      model((current) => {
        expect(tabPaths(current)).toEqual(['a.ts']);
        expect(activePath(current)).toBe('a.ts');
      }),
      message(Message.RequestedCloseTab({ path: 'a.ts' })),
      model((current) => expect(current.file._tag).toBe('Closed')),
    );
  });

  test('editor saves the right tab when a save result arrives for a background tab', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.EditedFile({ path: 'a.ts', text: 'two' })),
      message(Message.LoadedFile({ name: 'demo', path: 'b.ts', text: 'bee' })),
      message(Message.RequestedSave({ path: 'a.ts' })),
      Command.expectHas(SaveFile),
      Command.resolve(SaveFile, Message.SavedFile({ name: 'demo', path: 'a.ts', text: 'two' })),
      model((current) => {
        expect(activePath(current)).toBe('b.ts');
        const a = current.file._tag === 'Editing' ? current.file.open[0] : undefined;
        expect(a?.base).toBe('two');
        expect(a?.saving).toBe(false);
      }),
    );
  });

  test('editor quick open: Cmd-P lists files, typing filters, Enter opens a tab', () => {
    story(
      update,
      given(editing()),
      message(Message.PressedShortcut({ key: 'quick-open' })),
      Command.expectHas(ListWorkspaceFiles),
      Command.resolve(FocusQuickOpen, Message.CompletedEffect()),
      Command.resolve(
        ListWorkspaceFiles,
        Message.LoadedFileList({ name: 'demo', files: ['README.md', 'src/app.ts', 'src/util.ts'] }),
      ),
      message(Message.UpdatedQuickOpen({ query: 'app' })),
      message(Message.ChoseQuickOpen({ index: 0 })),
      Command.expectExact(LoadFile),
      model((current) => {
        expect(current.quickOpen).toBeNull();
        expect(current.file._tag).toBe('Loading');
      }),
      Command.resolve(
        LoadFile,
        Message.LoadedFile({ name: 'demo', path: 'src/app.ts', text: 'x' }),
      ),
      model((current) => expect(tabPaths(current)).toEqual(['src/app.ts'])),
    );
  });

  test('editor quick open does nothing without an open thread, and Escape closes it first', () => {
    story(
      update,
      given({ ...editing(), name: null }),
      message(Message.OpenedQuickOpen()),
      Command.expectNone(),
      model((current) => expect(current.quickOpen).toBeNull()),
    );
    story(
      update,
      given({ ...editing(), quickOpen: { query: '', index: 0, files: [] } }),
      message(Message.PressedShortcut({ key: 'stop' })),
      model((current) => expect(current.quickOpen).toBeNull()),
    );
  });

  test('editor compare: Compare shows the agent diff, Escape hides it before closing', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.EditedFile({ path: 'a.ts', text: 'mine' })),
      message(Message.CheckedDisk({ name: 'demo', path: 'a.ts', text: 'agent' })),
      message(Message.ToggledCompare()),
      model((current) =>
        expect(current.file._tag === 'Editing' && current.file.comparing).toBe(true),
      ),
      message(Message.PressedShortcut({ key: 'stop' })),
      model((current) => {
        expect(current.file._tag).toBe('Editing');
        expect(current.file._tag === 'Editing' && current.file.comparing).toBe(false);
      }),
    );
  });
});
