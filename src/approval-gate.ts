import {
  defineExtension,
  defineSignal,
  type Extension,
  hook,
  type TaskId,
  ToolTask,
} from '@earendil-works/pi-durable';
import { bool, obj } from '@earendil-works/pi-schema';
import {
  APPROVAL_WAIT_MS,
  approvalKey,
  type PendingApproval,
  RISK_LABELS,
  riskOf,
} from './approval';

export const Approval = defineSignal({
  name: 'coil.approval',
  version: 1,
  schema: obj({ allow: bool() }),
});

export type ApprovalBoard = {
  readonly open: (pending: PendingApproval) => void;
  readonly close: (key: string) => void;
};

export const NO_BOARD: ApprovalBoard = { open: () => {}, close: () => {} };

export const approvalGate = (board: ApprovalBoard): Extension =>
  defineExtension({
    name: 'coil-approvals',
    hooks: [
      hook(ToolTask, {
        beforeTool: async (call, api, context) => {
          const args = call.arguments as Record<string, unknown>;
          const risk = riskOf(call.name, args);

          if (risk === null) return undefined;

          const key = await approvalKey(call.id, call.name, args);
          const until = await api.memo(
            `coil.approval.until.${key}`,
            api.now() + APPROVAL_WAIT_MS,
            context,
          );
          const state = await api.readSignal(Approval, key, context);

          if (state === undefined) {
            board.open({
              key,
              taskId: Number(api.taskId),
              tool: call.name,
              args: JSON.stringify(args),
              risk,
              until,
            });

            return { sleep: { signals: [Approval.key(key)], until } };
          }

          board.close(key);

          if ('expired' in state)
            return {
              block: `Nobody approved this in time, so it did not run (${RISK_LABELS[risk]}).`,
            };

          return state.value.allow
            ? undefined
            : {
                block: `The person said no, so it did not run (${RISK_LABELS[risk]}). Ask before trying another way.`,
              };
        },
      }),
    ],
  });

export const taskIdOf = (raw: number): TaskId => raw as unknown as TaskId;
