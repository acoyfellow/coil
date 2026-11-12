import * as Domain from '@alchemy.run/domain';
import { ThreadId } from './Thread.id.ts';
import { Busy, NotCreated } from './ThreadRejections.rejection.ts';

export class ThreadPaused extends Domain.Event('ThreadPaused', {}) {}

export class PauseThread extends Domain.Command('PauseThread', {
  target: ThreadId,
  input: {},
  events: [ThreadPaused],
  rejects: [NotCreated, Busy],
}) {}
