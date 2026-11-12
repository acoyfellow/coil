import * as Schema from 'effect/Schema';

export const ThreadId = Schema.String.pipe(Schema.brand('ThreadId'));
export type ThreadId = typeof ThreadId.Type;
