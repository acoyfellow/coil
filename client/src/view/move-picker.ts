import { Option } from 'effect';
import type { Html } from 'foldkit/html';
import { Message } from '../message';
import type { Model } from '../model';
import { moveChoices } from '../move-picker';
import { type H, icon } from './parts';

const KEYS: Record<string, Message> = {
  ArrowDown: Message.MovedMovePicker({ delta: 1 }),
  ArrowUp: Message.MovedMovePicker({ delta: -1 }),
  Escape: Message.ClosedMovePicker(),
};

const threadTitle = (model: Model, name: string): string => {
  const threads = model.threads._tag === 'Ready' ? model.threads.value : [];
  const thread = threads.find((each) => each.name === name);

  return thread === undefined || thread.title === '' ? name : thread.title;
};

export const movePicker = (h: H, model: Model): Html => {
  const state = model.movePicker;

  if (state === null) return null;

  const choices = moveChoices(model, state.name, state.query);

  return h.div(
    [h.Class('dialog-backdrop'), h.OnClick(Message.ClosedMovePicker())],
    [
      h.div(
        [
          h.Class('dialog palette move-picker'),
          h.Id('move-picker'),
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel('Move thread to a folder'),
          h.OnClick(Message.CompletedEffect(), { propagation: 'Stop' }),
        ],
        [
          h.div([h.Class('move-picker-title')], [`Move "${threadTitle(model, state.name)}" to`]),
          h.input([
            h.Id('move-picker-input'),
            h.Placeholder('Find or create a folder'),
            h.Autocomplete('off'),
            h.AriaLabel('Folder'),
            h.Value(state.query),
            h.OnInput((query) => Message.UpdatedMovePicker({ query })),
            h.OnKeyDownPreventDefault((key) => {
              if (key === 'Enter')
                return Option.some(Message.ChoseMovePicker({ index: state.index }));

              const mapped = KEYS[key];

              return mapped === undefined ? Option.none() : Option.some(mapped);
            }),
          ]),
          h.div(
            [h.Class('palette-list'), h.Role('listbox')],
            choices.length === 0
              ? [h.div([h.Class('palette-empty')], ['Type a name to make a folder.'])]
              : choices.map((choice, index) =>
                  h.button(
                    [
                      h.Class(index === state.index ? 'on' : ''),
                      h.Role('option'),
                      h.AriaSelected(index === state.index),
                      h.DataAttribute(
                        'move-choice',
                        choice._tag === 'Folder' ? choice.folder : choice._tag,
                      ),
                      h.OnClick(Message.ChoseMovePicker({ index })),
                    ],
                    [
                      h.span(
                        [h.Class('move-choice')],
                        [
                          icon(h, choice._tag === 'Create' ? 'plus' : 'folder'),
                          choice._tag === 'Create' ? `New folder "${choice.label}"` : choice.label,
                        ],
                      ),
                    ],
                  ),
                ),
          ),
        ],
      ),
    ],
  );
};
