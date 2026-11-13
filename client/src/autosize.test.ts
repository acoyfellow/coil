import { describe, expect, it } from 'vitest';
import { fitToContent, refitOnValueSet } from './mount';

const LINE = 20;
const WIDTH_CHARS = 40;

const fakeField = (maxHeight = 200) => {
  const field = document.createElement('textarea');
  document.body.append(field);
  field.style.maxHeight = `${maxHeight}px`;
  Object.defineProperty(field, 'scrollHeight', {
    configurable: true,
    get: () => {
      const text = field.value;
      const lines = text
        .split('\n')
        .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / WIDTH_CHARS)), 0);

      return lines * LINE;
    },
  });

  return field;
};

describe('composer autosize', () => {
  it('grows one line at a time as text wraps and shrinks back when lines are deleted', () => {
    const field = fakeField();
    const fit = fitToContent(field);

    field.value = 'short';
    fit();
    expect(field.style.height).toBe('20px');

    field.value = 'x'.repeat(100);
    fit();
    expect(field.style.height).toBe('60px');

    field.value = 'x'.repeat(30);
    fit();
    expect(field.style.height).toBe('20px');
  });

  it('when emptied, the field fits the placeholder, even a placeholder that wraps', () => {
    const field = fakeField();
    field.placeholder = 'p'.repeat(70);
    const fit = fitToContent(field);

    field.value = 'a\nb\nc\nd';
    fit();
    expect(field.style.height).toBe('80px');

    field.value = '';
    fit();
    expect(field.style.height).toBe('40px');
    expect(field.value).toBe('');
  });

  it('caps at the max height and only then shows a scrollbar', () => {
    const field = fakeField(100);
    const fit = fitToContent(field);

    field.value = 'a\nb';
    fit();
    expect(field.style.overflowY).toBe('hidden');

    field.value = Array.from({ length: 20 }, () => 'line').join('\n');
    fit();
    expect(field.style.height).toBe('100px');
    expect(field.style.overflowY).toBe('auto');
  });

  it('a value set from code, like clearing after send, refits without an input event', () => {
    const field = fakeField();
    const fit = fitToContent(field);
    const stop = refitOnValueSet(field, fit);

    field.value = Array.from({ length: 6 }, () => 'line').join('\n');
    expect(field.style.height).toBe('120px');

    field.value = '';
    expect(field.style.height).toBe('20px');

    stop();
  });
});
