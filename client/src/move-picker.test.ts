import { describe, expect, it } from 'vitest';
import type { Model } from './model';
import { moveChoices } from './move-picker';

const names = ['Billing', 'Design', 'Docs', 'Infra', 'Research', 'Release', 'Security', 'Support'];

const model = (current: string | null) =>
  ({
    folders: names.map((name, index) => ({ id: `f-${name}`, name, order: index + 1 })),
    threads: { _tag: 'Ready', value: [{ name: 't', title: 't', folder: current }] },
  }) as unknown as Model;

const labels = (m: Model, query: string) => moveChoices(m, 't', query).map((c) => c.label);

describe('move picker', () => {
  it('lists every folder except the current one, in folder order', () => {
    expect(labels(model('f-Docs'), '')).toEqual(names.filter((n) => n !== 'Docs').concat('Recent'));
  });

  it('offers Recent only when the thread is in a folder', () => {
    expect(labels(model(null), '')).not.toContain('Recent');
  });

  it('ranks a prefix match above a word match above a substring match', () => {
    expect(labels(model(null), 're').slice(0, 2)).toEqual(['Research', 'Release']);
    expect(labels(model(null), 'se')).toEqual(['Security', 'Research', 'Release', 'se']);
  });

  it('offers to create a folder for a new name, but not for an existing one', () => {
    expect(moveChoices(model(null), 't', 'Hiring').at(-1)).toEqual({
      _tag: 'Create',
      label: 'Hiring',
    });
    expect(moveChoices(model(null), 't', 'docs').some((c) => c._tag === 'Create')).toBe(false);
  });
});
