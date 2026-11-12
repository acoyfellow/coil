import * as Domain from '@alchemy.run/domain';
import * as Schema from 'effect/Schema';
import { ThreadId } from './Thread.id.ts';
import { ThreadWoke } from './WakeThread.command.ts';
import { Archived, Busy, NotCreated } from './ThreadRejections.rejection.ts';

export class TurnStarted extends Domain.Event('TurnStarted', {
  turn: Schema.String,
  text: Schema.String,
}) {}

export class StartTurn extends Domain.Command('StartTurn', {
  target: ThreadId,
  input: { turn: Schema.String, text: Schema.String },
  events: [ThreadWoke, TurnStarted],
  rejects: [NotCreated, Archived, Busy],
}) {}
