import { Command, given, message, model, story } from 'foldkit/story';
import { describe, expect, test } from 'vitest';
import type { ThreadView } from '../../shared/protocol';
import {
  CheckDisk,
  ConfirmDiscard,
  ExpireToast,
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

const buffer = (current: Model) => (current.file._tag === 'Editing' ? current.file.buffer : null);

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

  test('closing a file with unsaved edits asks first, and keeps it open if the user says no', () => {
    story(
      update,
      given(editing()),
      message(Message.LoadedFile({ name: 'demo', path: 'a.ts', text: 'one' })),
      message(Message.EditedFile({ path: 'a.ts', text: 'two' })),
      message(Message.RequestedCloseFile()),
      Command.expectExact(ConfirmDiscard),
      Command.resolve(ConfirmDiscard, Message.CompletedEffect()),
      model((current) => expect(buffer(current)?.text).toBe('two')),
      message(Message.RequestedCloseFile()),
      Command.resolve(ConfirmDiscard, Message.ClosedFile()),
      model((current) => expect(current.file._tag).toBe('Closed')),
    );
  });
});
