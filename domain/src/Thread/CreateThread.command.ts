import * as Domain from '@alchemy.run/domain';
import * as Schema from 'effect/Schema';
import { ThreadId } from './Thread.id.ts';
import { AlreadyCreated } from './ThreadRejections.rejection.ts';

export class ThreadCreated extends Domain.Event('ThreadCreated', {
  owner: Schema.String,
  title: Schema.String,
  repo: Schema.NullOr(Schema.String),
}) {}

export class CreateThread extends Domain.Command('CreateThread', {
  target: ThreadId,
  input: { owner: Schema.String, title: Schema.String, repo: Schema.NullOr(Schema.String) },
  events: [ThreadCreated],
  rejects: [AlreadyCreated],
}) {}
