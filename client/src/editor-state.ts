export type Buffer = {
  readonly path: string;
  readonly base: string;
  readonly text: string;
  readonly saving: boolean;
  readonly conflict: string | null;
};

export const opened = (path: string, text: string): Buffer => ({
  path,
  base: text,
  text,
  saving: false,
  conflict: null,
});

export const isDirty = (buffer: Buffer): boolean => buffer.text !== buffer.base;

export const edited = (buffer: Buffer, text: string): Buffer => ({ ...buffer, text });

export const savingStarted = (buffer: Buffer): Buffer => ({ ...buffer, saving: true });

export const saved = (buffer: Buffer, text: string): Buffer => ({
  ...buffer,
  base: text,
  saving: false,
  conflict: null,
});

export const saveFailed = (buffer: Buffer): Buffer => ({ ...buffer, saving: false });

export type DiskChange =
  | { readonly kind: 'same' }
  | { readonly kind: 'reload'; readonly buffer: Buffer }
  | { readonly kind: 'conflict'; readonly buffer: Buffer };

export const diskChanged = (buffer: Buffer, disk: string): DiskChange => {
  if (disk === buffer.base) return { kind: 'same' };
  if (!isDirty(buffer)) return { kind: 'reload', buffer: opened(buffer.path, disk) };
  if (disk === buffer.text) return { kind: 'reload', buffer: opened(buffer.path, disk) };

  return { kind: 'conflict', buffer: { ...buffer, conflict: disk } };
};

export const keptMine = (buffer: Buffer): Buffer =>
  buffer.conflict === null ? buffer : { ...buffer, base: buffer.conflict, conflict: null };

export const tookTheirs = (buffer: Buffer): Buffer =>
  buffer.conflict === null ? buffer : opened(buffer.path, buffer.conflict);

export type SavePlan =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'write'; readonly text: string }
  | { readonly kind: 'blocked'; readonly reason: string };

export const planSave = (buffer: Buffer): SavePlan => {
  if (buffer.conflict !== null)
    return {
      kind: 'blocked',
      reason: 'The file changed on disk. Keep yours or take theirs first.',
    };
  if (buffer.saving) return { kind: 'nothing' };
  if (!isDirty(buffer)) return { kind: 'nothing' };

  return { kind: 'write', text: buffer.text };
};
