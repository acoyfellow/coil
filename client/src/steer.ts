import { Schema } from 'effect';

export const SteerState = Schema.Struct({
  name: Schema.String,
  goal: Schema.String,
  status: Schema.Literals(['editing', 'drafting', 'failed']),
  problem: Schema.NullOr(Schema.String),
});

export type SteerState = typeof SteerState.Type;

export const STEER_SUGGESTIONS = [
  'get it unstuck',
  'make it run the tests',
  'answer its question with yes',
  'make it explain what it changed',
] as const;

export const openSteer = (name: string): SteerState => ({
  name,
  goal: '',
  status: 'editing',
  problem: null,
});

export const typeGoal = (state: SteerState, goal: string): SteerState => ({
  ...state,
  goal,
  status: state.status === 'drafting' ? 'drafting' : 'editing',
});

export const canDraft = (state: SteerState): boolean =>
  state.status !== 'drafting' && state.goal.trim() !== '';

export const startDraft = (state: SteerState): SteerState =>
  canDraft(state) ? { ...state, status: 'drafting', problem: null } : state;

export const failDraft = (state: SteerState, problem: string): SteerState => ({
  ...state,
  status: 'failed',
  problem,
});

export const acceptsResult = (state: SteerState | null, name: string, goal: string): boolean =>
  state !== null &&
  state.status === 'drafting' &&
  state.name === name &&
  state.goal.trim() === goal;

export const draftInto = (current: string, draft: string): string =>
  current.trim() === '' ? draft : `${current.trimEnd()}\n\n${draft}`;
