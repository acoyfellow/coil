import { Option } from 'effect';
import type { Html } from 'foldkit/html';
import { rememberFiles } from '../command';
import { Message } from '../message';
import type { Model } from '../model';
import { Autosize } from '../mount';
import { viewOf } from '../update';
import { meter } from './meter';
import { type H, icon } from './parts';

const hint = (model: Model): string => {
  const view = viewOf(model);

  if (view === null) return '';
  if (model.uploading > 0)
    return `Uploading ${model.uploading} file${model.uploading === 1 ? '' : 's'}…`;
  if (view.busy) return 'Working. You can leave; it keeps going.';
  if (view.phase === 'paused') return 'Paused. Sending resumes it from the saved disk.';

  return '';
};

export const composer = (h: H, model: Model): Html => {
  const view = viewOf(model);
  const working = view?.busy ?? false;

  return h.div(
    [
      h.Class('composer'),
      h.Id('composer'),
      h.Style({ display: model.name === null ? 'none' : '' }),
      h.AllowDrop(),
      h.OnDropFiles((files) => {
        rememberFiles(files);

        return Message.DroppedFiles({ count: files.length });
      }),
    ],
    [
      h.div(
        [h.Class('composer-inner')],
        [
          h.keyed('textarea')('composer-text', [
            h.Id('text'),
            h.Rows(1),
            h.OnMount(Autosize({})),
            h.Placeholder('Ask the agent to do something in its computer'),
            h.Value(model.draft),
            h.OnInput((value) => Message.UpdatedDraft({ value })),
            h.OnKeyDownPreventDefault((key, modifiers) =>
              key === 'Enter' && !modifiers.shiftKey
                ? Option.some(Message.SubmittedDraft())
                : Option.none(),
            ),
          ]),
          h.div(
            [h.Class('composer-foot')],
            [
              ...(view === null || model.name === null ? [] : [meter(h, model, view, model.name)]),
              h.div([h.Class('hint'), h.Id('hint')], [hint(model)]),
              working && model.name !== null
                ? h.button(
                    [
                      h.Id('stop'),
                      h.Class('stop'),
                      h.AriaLabel('Stop'),
                      h.DataAttribute('tip', 'Stop the agent'),
                      h.OnClick(Message.ClickedOp({ name: model.name, op: { _tag: 'Stop' } })),
                    ],
                    [icon(h, 'square')],
                  )
                : h.button(
                    [
                      h.Id('send'),
                      h.AriaLabel('Send'),
                      h.Disabled(view === null),
                      h.OnClick(Message.SubmittedDraft()),
                    ],
                    ['↑'],
                  ),
            ],
          ),
        ],
      ),
    ],
  );
};
