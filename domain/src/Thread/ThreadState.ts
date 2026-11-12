import * as Schema from 'effect/Schema';

const Common = {
  owner: Schema.String,
  title: Schema.String,
  repo: Schema.NullOr(Schema.String),
  browserGeneration: Schema.Int,
};

export const ThreadState = Schema.Union([
  Schema.TaggedStruct('Unborn', {}),
  Schema.TaggedStruct('Paused', Common),
  Schema.TaggedStruct('Awake', Common),
  Schema.TaggedStruct('Working', { ...Common, turn: Schema.String }),
  Schema.TaggedStruct('Archived', Common),
]);
export type ThreadState = typeof ThreadState.Type;

export type Live = Exclude<ThreadState, { _tag: 'Unborn' }>;
