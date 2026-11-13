import type { Document, Html } from 'foldkit/html';
import { SIZES } from '../../../shared/protocol';
import { Message } from '../message';
import type { Model } from '../model';
import { bar } from './bar';
import { composer } from './composer';
import { feed } from './feed';
import { movePicker } from './move-picker';
import { palette } from './palette';
import { fileModal, historyModal, panel } from './panel';
import { type H, spinner } from './parts';
import { settings } from './settings';
import { side } from './side';

const SIZE_LABELS: Record<(typeof SIZES)[number], string> = {
  lite: 'lite (smallest)',
  'standard-1': 'standard-1 (default)',
  'standard-2': 'standard-2',
  'standard-3': 'standard-3',
  'standard-4': 'standard-4 (largest)',
};

const newThreadDialog = (h: H, model: Model): Html => {
  const form = model.newThread;

  if (!form.open) return null;

  return h.div(
    [h.Class('dialog-backdrop'), h.OnClick(Message.ClosedNewThread())],
    [
      h.div(
        [
          h.Class('dialog'),
          h.Id('new'),
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel('New thread'),
          h.OnClick(Message.CompletedEffect(), { propagation: 'Stop' }),
          h.OnKeyDown((key) =>
            key === 'Escape' ? Message.ClosedNewThread() : Message.CompletedEffect(),
          ),
        ],
        [
          h.form(
            [h.OnSubmit(Message.SubmittedNewThread())],
            [
              h.h3([], ['New thread']),
              h.label(
                [],
                [
                  'Git repository (optional)',
                  h.input([
                    h.Id('new-repo'),
                    h.Placeholder('https://github.com/owner/repo'),
                    h.Autocomplete('off'),
                    h.Autofocus(true),
                    h.Value(form.repo),
                    h.OnInput((value) => Message.UpdatedNewRepo({ value })),
                  ]),
                ],
              ),
              h.label(
                [],
                [
                  'Title (optional)',
                  h.input([
                    h.Id('new-title'),
                    h.Placeholder('What is this thread for?'),
                    h.Autocomplete('off'),
                    h.Value(form.title),
                    h.OnInput((value) => Message.UpdatedNewTitle({ value })),
                  ]),
                ],
              ),
              h.label(
                [],
                [
                  'Computer size',
                  h.select(
                    [h.Id('new-size'), h.OnChange((value) => Message.UpdatedNewSize({ value }))],
                    SIZES.map((size) =>
                      h.option(
                        [h.Value(size), h.Selected(size === form.size)],
                        [SIZE_LABELS[size]],
                      ),
                    ),
                  ),
                ],
              ),
              h.div(
                [h.Class('actions')],
                [
                  h.button(
                    [h.Type('button'), h.Id('new-cancel'), h.OnClick(Message.ClosedNewThread())],
                    ['Cancel'],
                  ),
                  h.button(
                    [
                      h.Class('primary'),
                      h.Id('new-go'),
                      h.Type('submit'),
                      h.Disabled(form.creating),
                    ],
                    form.creating ? [spinner(h), 'Starting its computer'] : ['Create'],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
};

const toasts = (h: H, model: Model): Html[] =>
  model.toasts.map((toast, index) =>
    h.keyed('div')(
      `toast-${toast.id}`,
      [h.Class(`toast${toast.bad ? ' bad' : ''}`), h.Style({ bottom: `${14 + index * 40}px` })],
      [toast.text],
    ),
  );

const appClass = (model: Model): string =>
  [
    'app',
    model.drawer === 'side' ? 'show-side' : '',
    model.drawer === 'panel' ? 'show-panel' : '',
    model.online ? '' : 'offline',
  ]
    .filter((part) => part !== '')
    .join(' ');

const title = (model: Model): string => {
  if (model.name === null || model.view._tag !== 'Ready') return 'coil';

  return `${model.view.value.busy ? '(working) ' : ''}${model.view.value.title} · coil`;
};

export const view = (model: Model, h: H): Document => ({
  title: title(model),
  body: h.div(
    [h.Class('root')],
    [
      h.div(
        [h.Class(appClass(model))],
        [
          side(h, model),
          h.div(
            [
              h.Class('resizer side-resizer'),
              h.DataAttribute('resize', 'side'),
              h.AriaHidden(true),
            ],
            [],
          ),
          h.main([h.Class('main')], [bar(h, model), feed(h, model), composer(h, model)]),
          h.div(
            [
              h.Class('resizer panel-resizer'),
              h.DataAttribute('resize', 'panel'),
              h.AriaHidden(true),
            ],
            [],
          ),
          panel(h, model),
        ],
      ),
      newThreadDialog(h, model),
      palette(h, model),
      movePicker(h, model),
      historyModal(h, model),
      fileModal(h, model),
      settings(h, model),
      ...toasts(h, model),
    ],
  ),
});
