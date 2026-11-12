import * as Domain from '@alchemy.run/domain';
import * as Schema from 'effect/Schema';
import { ThreadId } from './Thread.id.ts';

export class TurnFinished extends Domain.Event('TurnFinished', {
  turn: Schema.String,
  outcome: Schema.Literals(['done', 'failed', 'stopped']),
}) {}

export class FinishTurn extends Domain.Command('FinishTurn', {
  target: ThreadId,
  input: { turn: Schema.String, outcome: Schema.Literals(['done', 'failed', 'stopped']) },
  events: [TurnFinished],
  rejects: [],
}) {}
