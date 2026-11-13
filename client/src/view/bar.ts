import type { Html } from 'foldkit/html';
import { SIZES, type ThreadView } from '../../../shared/protocol';
import { Message } from '../message';
import type { Action, Model } from '../model';
import { viewOf } from '../update';
import { type H, icon, phaseKey, phaseLabel, spinner } from './parts';

type ActionButton = {
  readonly key: Action;
  readonly label: string;
  readonly hint: string;
  readonly disabled: boolean;
  readonly message: Message;
};

const actionButton = (
  h: H,
  model: Model,
  locked: boolean,
  button: ActionButton,
  extra: Html[] = [],
): Html =>
  h.button(
    [
      h.Class('act'),
      h.Id(button.key === 'size' ? 'size' : `act-${button.key}`),
      h.DataAttribute('tip', button.hint),
      h.AriaLabel(button.label),
      h.Disabled(locked || button.disabled),
      h.OnClick(button.message),
      ...(button.key === 'size' ? [h.AriaHasPopup('menu')] : []),
    ],
    [
      model.action === button.key ? spinner(h) : icon(h, button.key),
      h.span([h.Class('act-label')], [button.label]),
      ...extra,
    ],
  );

const opButton = (h: H, key: string, label: string, disabled: boolean, message: Message): Html =>
  h.button(
    [
      h.Class('act'),
      h.Id(`act-${key}`),
      h.DataAttribute('tip', label),
      h.AriaLabel(label),
      h.Disabled(disabled),
      h.OnClick(message),
    ],
    [icon(h, key), h.span([h.Class('act-label')], [label])],
  );

const sizeMenu = (h: H, model: Model, view: ThreadView): Html =>
  h.div(
    [h.Class('size-list'), h.Id('size-list'), h.Role('menu'), h.Hidden(!model.sizeMenuOpen)],
    SIZES.map((size) =>
      h.button(
        [
          h.Role('menuitemradio'),
          h.AriaChecked(size === view.size),
          h.DataAttribute('size', size),
          h.Class(size === view.size ? 'on' : ''),
          h.OnClick(Message.PickedSize({ size })),
        ],
        [h.span([h.Class('tick')], size === view.size ? [icon(h, 'check')] : []), size],
      ),
    ),
  );

const actions = (h: H, model: Model, view: ThreadView): Html => {
  const locked = model.action !== null || view.busy;
  const button = (spec: ActionButton) => actionButton(h, model, locked, spec);

  return h.div(
    [h.Class(`actions${model.menuOpen ? ' open' : ''}`), h.Id('actions')],
    [
      h.div(
        [h.Class('act-group')],
        [
          button({
            key: 'compact',
            label: 'Compact',
            hint: 'Compact: summarise the conversation and save the disk',
            disabled: false,
            message: Message.ClickedAction({ action: 'compact' }),
          }),
          button({
            key: 'pause',
            label: 'Pause',
            hint: 'Pause: save the disk and turn the computer off',
            disabled: view.phase === 'paused' || view.phase === 'new',
            message: Message.ClickedAction({ action: 'pause' }),
          }),
          button({
            key: 'fork',
            label: 'Fork',
            hint: 'Fork: start a new thread from this disk',
            disabled: false,
            message: Message.ClickedAction({ action: 'fork' }),
          }),
          h.span(
            [h.Class('size-wrap'), h.DataAttribute('popover', 'size')],
            [
              actionButton(h, model, model.action !== null, {
                key: 'size',
                label: `Size: ${view.size}`,
                hint: `Computer size (${view.size}). Changing it restarts a running computer; the disk is kept.`,
                disabled: view.busy,
                message: Message.ToggledSizeMenu(),
              }),
              sizeMenu(h, model, view),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('act-group')],
        [
          opButton(
            h,
            'rename',
            'Rename',
            view.busy,
            Message.ClickedOp({ name: view.name, op: { _tag: 'Rename' } }),
          ),
          opButton(
            h,
            'archive',
            'Archive',
            view.busy,
            Message.ClickedOp({ name: view.name, op: { _tag: 'Archive', archived: true } }),
          ),
          opButton(
            h,
            'trash',
            'Delete',
            view.busy,
            Message.ClickedOp({ name: view.name, op: { _tag: 'Delete' } }),
          ),
        ],
      ),
    ],
  );
};

const panelToggle = (h: H): Html =>
  h.button(
    [
      h.Class('collapse panel-toggle'),
      h.DataAttribute('tip', 'Show the computer'),
      h.AriaLabel('Toggle computer'),
      h.OnClick(Message.OpenedDrawer({ drawer: 'panel' })),
    ],
    [icon(h, 'computer')],
  );

const collapse = (h: H, edge: 'side' | 'panel'): Html =>
  h.button(
    [
      h.Class(`collapse collapse-${edge}`),
      h.DataAttribute('collapse', edge),
      h.DataAttribute(
        'tip',
        edge === 'side' ? 'Show or hide threads (⌘B)' : 'Show or hide the computer (⌘J)',
      ),
      h.AriaLabel(edge === 'side' ? 'Toggle threads' : 'Toggle computer'),
    ],
    [
      h.svg(
        [
          h.ViewBox('0 0 24 24'),
          h.Class('icon'),
          h.AriaHidden(true),
          h.InnerHTML(
            edge === 'side'
              ? '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 4v16" stroke="currentColor" stroke-width="1.6"/>'
              : '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 4v16" stroke="currentColor" stroke-width="1.6"/>',
          ),
        ],
        [],
      ),
    ],
  );

export const bar = (h: H, model: Model): Html => {
  const threads = h.button(
    [
      h.Class('narrow'),
      h.AriaLabel('Threads'),
      h.OnClick(Message.OpenedDrawer({ drawer: 'side' })),
    ],
    ['☰'],
  );

  if (model.name === null)
    return h.header(
      [h.Class('bar'), h.Id('bar')],
      [threads, collapse(h, 'side'), h.h1([], ['Threads'])],
    );

  const view = viewOf(model);

  if (view === null)
    return h.header(
      [h.Class('bar'), h.Id('bar')],
      [
        threads,
        collapse(h, 'side'),
        h.h1([h.Title(model.name)], [model.name]),
        collapse(h, 'panel'),
        panelToggle(h),
      ],
    );

  return h.header(
    [h.Class('bar'), h.Id('bar')],
    [
      threads,
      collapse(h, 'side'),
      h.h1([h.Title(model.name)], [view.title]),
      h.span(
        [h.Class(`chip ${phaseKey(view)}`), h.Id('phase')],
        [...(view.busy ? [spinner(h)] : []), phaseLabel(view)],
      ),
      h.button([h.Class('more'), h.AriaLabel('Actions'), h.OnClick(Message.ToggledMenu())], ['⋯']),
      actions(h, model, view),
      collapse(h, 'panel'),
      panelToggle(h),
    ],
  );
};
