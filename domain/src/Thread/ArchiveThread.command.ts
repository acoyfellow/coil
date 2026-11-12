import * as Domain from '@alchemy.run/domain';
import { ThreadId } from './Thread.id.ts';
import { Busy, NotCreated } from './ThreadRejections.rejection.ts';

export class ThreadArchived extends Domain.Event('ThreadArchived', {}) {}

export class ArchiveThread extends Domain.Command('ArchiveThread', {
  target: ThreadId,
  input: {},
  events: [ThreadArchived],
  rejects: [NotCreated, Busy],
}) {}
