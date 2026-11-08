export type LifecycleState = 'new' | 'awake' | 'paused' | 'working' | 'compacting' | 'failed';

export type LifecycleInput = {
  readonly phase: 'new' | 'awake' | 'paused';
  readonly busy: boolean;
  readonly compacting: boolean;
  readonly wakeError: string;
};

export const lifecycleOf = (input: LifecycleInput): LifecycleState => {
  if (input.compacting) return 'compacting';
  if (input.busy) return 'working';
  if (input.wakeError !== '') return 'failed';
  return input.phase;
};
