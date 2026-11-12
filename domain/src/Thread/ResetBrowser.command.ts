import * as Domain from '@alchemy.run/domain';
import * as Schema from 'effect/Schema';
import { ThreadId } from './Thread.id.ts';
import { Archived, NotCreated } from './ThreadRejections.rejection.ts';

export class BrowserReset extends Domain.Event('BrowserReset', { generation: Schema.Int }) {}

export class ResetBrowser extends Domain.Command('ResetBrowser', {
  target: ThreadId,
  input: {},
  events: [BrowserReset],
  rejects: [NotCreated, Archived],
  reply: { generation: Schema.Int },
}) {}
