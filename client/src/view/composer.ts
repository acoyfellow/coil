import { Option } from 'effect';
import type { Html } from 'foldkit/html';
import type { PendingApproval } from '../../../shared/protocol';
import { rememberFiles } from '../command';
import { Message } from '../message';
import type { Model } from '../model';
import { Autosize } from '../mount';
import { canDraft, STEER_SUGGESTIONS, type SteerState } from '../steer';
import { viewOf } from '../update';
import { meter } from './meter';
import { type H, icon } from './parts';

const touchKeyboard = (): boolean => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

const hint = (model: Model): string => {
  const view = viewOf(model);

  if (view === null) return '';
  if (model.uploading > 0)
    return `Uploading ${model.uploading} file${model.uploading === 1 ? '' : 's'}…`;
  if (view.busy) return '';
  if (view.phase === 'paused') return 'Paused. Sending resumes it from the saved disk.';

  return touchKeyboard() ? '' : 'Enter sends · Shift+Enter for a new line';
};

const RISK_TITLES: Readonly<Record<PendingApproval['risk'], string>> = {
  push: 'The agent wants to push code',
  deploy: 'The agent wants to deploy or publish',
  delete: 'The agent wants to delete a thread',
};

const commandOf = (approval: PendingApproval): string => {
  try {
    const args = JSON.parse(approval.args) as Record<string, unknown>;

    return typeof args.command === 'string' ? args.command : approval.args;
  } catch {
    return approval.args;
  }
};

const untilLabel = (until: number, now: number): string => {
  const minutes = Math.max(0, Math.round((until - now) / 60_000));

  return minutes >= 120 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
};

const approvalCard = (h: H, approval: PendingApproval, busy: boolean, now: number): Html =>
  h.div(
    [
      h.Class('approval'),
      h.DataAttribute('key', approval.key),
      h.DataAttribute('risk', approval.risk),
      h.Role('alertdialog'),
      h.AriaLabel(RISK_TITLES[approval.risk]),
    ],
    [
      h.div(
        [h.Class('approval-head')],
        [
          icon(h, 'shield'),
          h.span([h.Class('approval-title')], [RISK_TITLES[approval.risk]]),
          h.span(
            [h.Class('approval-until')],
            [`Waits ${untilLabel(approval.until, now)}, then does not run`],
          ),
        ],
      ),
      h.pre([h.Class('approval-args')], [commandOf(approval)]),
      h.div(
        [h.Class('approval-actions')],
        [
          h.button(
            [
              h.Class('approval-deny'),
              h.Disabled(busy),
              h.OnClick(Message.ClickedDecide({ key: approval.key, allow: false })),
            ],
            ['Deny'],
          ),
          h.button(
            [
              h.Class('approval-allow'),
              h.Disabled(busy),
              h.OnClick(Message.ClickedDecide({ key: approval.key, allow: true })),
            ],
            ['Approve'],
          ),
        ],
      ),
    ],
  );

const steerPanel = (h: H, state: SteerState): Html =>
  h.div(
    [h.Class('steer'), h.Id('steer'), h.DataAttribute('status', state.status)],
    [
      h.div(
        [h.Class('steer-row')],
        [
          h.input([
            h.Id('steer-goal'),
            h.Class('steer-goal'),
            h.Placeholder('Goal for the next message, e.g. get it unstuck'),
            h.AriaLabel('Steer goal'),
            h.Value(state.goal),
            h.Disabled(state.status === 'drafting'),
            h.OnInput((goal) => Message.UpdatedSteerGoal({ goal })),
            h.OnKeyDownPreventDefault((key) =>
              key === 'Enter'
                ? Option.some(Message.SubmittedSteer())
                : key === 'Escape'
                  ? Option.some(Message.ClosedSteer())
                  : Option.none(),
            ),
          ]),
          h.button(
            [
              h.Id('steer-draft'),
              h.Class('steer-draft'),
              h.AriaLabel('Draft the message'),
              h.DataAttribute('tip', 'Draft the message (Enter)'),
              h.Disabled(!canDraft(state)),
              h.OnClick(Message.SubmittedSteer()),
            ],
            [icon(h, state.status === 'drafting' ? 'loader' : 'sparkles')],
          ),
          h.button(
            [
              h.Id('steer-close'),
              h.AriaLabel('Close steer'),
              h.DataAttribute('tip', 'Close (Esc)'),
              h.OnClick(Message.ClosedSteer()),
            ],
            [icon(h, 'close')],
          ),
        ],
      ),
      state.status === 'drafting'
        ? h.div([h.Class('steer-note')], ['Drafting from the end of the thread…'])
        : state.problem !== null
          ? h.div([h.Class('steer-note steer-problem'), h.Role('alert')], [state.problem])
          : h.div(
              [h.Class('steer-chips')],
              STEER_SUGGESTIONS.map((goal) =>
                h.button(
                  [h.Class('steer-chip'), h.OnClick(Message.UpdatedSteerGoal({ goal }))],
                  [goal],
                ),
              ),
            ),
      h.div(
        [h.Class('steer-note')],
        ['The draft goes into the message box. Nothing is sent until you send it.'],
      ),
    ],
  );

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
      ...(viewOf(model)?.approvals ?? []).map((approval) =>
        approvalCard(h, approval, model.deciding.includes(approval.key), model.now),
      ),
      ...(model.steer !== null && model.steer.name === model.name
        ? [steerPanel(h, model.steer)]
        : []),
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
              key === 'Enter' && !modifiers.shiftKey && !touchKeyboard()
                ? Option.some(Message.SubmittedDraft())
                : Option.none(),
            ),
          ]),
          h.div(
            [h.Class('composer-foot')],
            [
              ...(view === null || model.name === null ? [] : [meter(h, model, view, model.name)]),
              h.div([h.Class('hint'), h.Id('hint'), h.Title(hint(model))], [hint(model)]),
              ...(view === null || model.name === null
                ? []
                : [
                    h.button(
                      [
                        h.Id('steer-open'),
                        h.Class(model.steer?.name === model.name ? 'is-on' : ''),
                        h.AriaLabel('Steer'),
                        h.AriaPressed(String(model.steer?.name === model.name)),
                        h.DataAttribute('tip', 'Steer: draft the next message from a goal'),
                        h.OnClick(Message.ClickedSteer()),
                      ],
                      [icon(h, 'sparkles')],
                    ),
                  ]),
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
                      h.Disabled(view === null || model.draft.trim() === ''),
                      h.DataAttribute(
                        'tip',
                        model.draft.trim() === '' ? 'Type a message to send' : 'Send (Enter)',
                      ),
                      h.OnClick(Message.SubmittedDraft()),
                    ],
                    [icon(h, 'send')],
                  ),
            ],
          ),
        ],
      ),
    ],
  );
};
