import * as Domain from '@alchemy.run/domain';
import * as Schema from 'effect/Schema';
import { ThreadId } from './Thread.id.ts';
import { Archived, NotCreated } from './ThreadRejections.rejection.ts';

export class RepoAttached extends Domain.Event('RepoAttached', { repo: Schema.String }) {}

export class AttachRepo extends Domain.Command('AttachRepo', {
  target: ThreadId,
  input: { repo: Schema.String },
  events: [RepoAttached],
  rejects: [NotCreated, Archived],
}) {}
