import * as Domain from '@alchemy.run/domain';
import { ThreadId } from './Thread.id.ts';
import { Archived, NotCreated } from './ThreadRejections.rejection.ts';

export class ThreadWoke extends Domain.Event('ThreadWoke', {}) {}

export class WakeThread extends Domain.Command('WakeThread', {
  target: ThreadId,
  input: {},
  events: [ThreadWoke],
  rejects: [NotCreated, Archived],
}) {}
