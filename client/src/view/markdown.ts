import type { Html } from 'foldkit/html';
import { Message } from '../message';
import type { H } from './parts';

export type Block =
  | { readonly kind: 'code'; readonly lang: string; readonly text: string; readonly open: boolean }
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly string[] }
  | { readonly kind: 'quote'; readonly text: string }
  | { readonly kind: 'rule' }
  | { readonly kind: 'paragraph'; readonly text: string };

const FENCE_OPEN = /^\s*```\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

const takeCode = (lines: readonly string[], start: number, lang: string) => {
  const body: string[] = [];
  let index = start;

  while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? '')) {
    body.push(lines[index] ?? '');
    index += 1;
  }

  const open = index >= lines.length;

  return { block: { kind: 'code', lang, text: body.join('\n'), open } as const, next: index + 1 };
};

const takeList = (lines: readonly string[], start: number, ordered: boolean) => {
  const pattern = ordered ? NUMBERED : BULLET;
  const items: string[] = [];
  let index = start;

  while (index < lines.length) {
    const match = pattern.exec(lines[index] ?? '');

    if (match === null) break;
    items.push(match[1] ?? '');
    index += 1;
  }

  return { block: { kind: 'list', ordered, items } as const, next: index };
};

const startsBlock = (line: string): boolean =>
  FENCE_OPEN.test(line) ||
  HEADING.test(line) ||
  BULLET.test(line) ||
  NUMBERED.test(line) ||
  QUOTE.test(line) ||
  RULE.test(line);

export const parseBlocks = (source: string): Block[] => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const fence = FENCE_OPEN.exec(line);

    if (line.trim() === '') {
      index += 1;
    } else if (fence !== null) {
      const taken = takeCode(lines, index + 1, fence[1] ?? '');

      blocks.push(taken.block);
      index = taken.next;
    } else if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      index += 1;
    } else if (HEADING.test(line)) {
      const match = HEADING.exec(line);

      blocks.push({ kind: 'heading', level: match?.[1]?.length ?? 1, text: match?.[2] ?? '' });
      index += 1;
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const taken = takeList(lines, index, !BULLET.test(line));

      blocks.push(taken.block);
      index = taken.next;
    } else if (QUOTE.test(line)) {
      const body: string[] = [];

      while (index < lines.length && QUOTE.test(lines[index] ?? '')) {
        body.push(QUOTE.exec(lines[index] ?? '')?.[1] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'quote', text: body.join('\n') });
    } else {
      const body: string[] = [line];

      index += 1;
      while (
        index < lines.length &&
        (lines[index] ?? '').trim() !== '' &&
        !startsBlock(lines[index] ?? '')
      ) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'paragraph', text: body.join('\n') });
    }
  }

  return blocks;
};

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\((https?:\/{2}[^)\s]+)\))/;

const safeLink = (href: string): boolean => /^https?:\/{2}/.test(href);

export const inline = (h: H, text: string): (Html | string)[] => {
  const out: (Html | string)[] = [];
  let rest = text;

  while (rest !== '') {
    const match = INLINE.exec(rest);

    if (match === null) {
      out.push(rest);
      break;
    }

    if (match.index > 0) out.push(rest.slice(0, match.index));

    const token = match[0];

    if (match[1] !== undefined) out.push(h.code([], [token.slice(1, -1)]));
    else if (match[2] !== undefined) out.push(h.strong([], [token.slice(2, -2)]));
    else if (match[3] !== undefined) out.push(h.em([], [token.slice(1, -1)]));
    else {
      const label = token.slice(1, token.indexOf(']'));
      const href = match[5] ?? '';

      out.push(
        safeLink(href)
          ? h.a([h.Href(href), h.Target('_blank'), h.Rel('noopener noreferrer')], [label])
          : label,
      );
    }

    rest = rest.slice(match.index + token.length);
  }

  return out;
};

const headingOf = (h: H, level: number) => (level <= 2 ? h.h3 : level === 3 ? h.h4 : h.h5);

const renderBlock = (h: H, block: Block): Html => {
  switch (block.kind) {
    case 'code':
      return h.pre(
        [
          h.Class(`code${block.open ? ' open' : ''}`),
          ...(block.lang === '' ? [] : [h.DataAttribute('lang', block.lang)]),
        ],
        [
          h.code([], [block.text]),
          ...(block.open
            ? []
            : [
                h.button(
                  [
                    h.Class('code-copy'),
                    h.AriaLabel('Copy code'),
                    h.OnClick(Message.ClickedCopy({ text: block.text })),
                  ],
                  ['Copy'],
                ),
              ]),
        ],
      );
    case 'heading':
      return headingOf(h, block.level)([], inline(h, block.text));
    case 'list':
      return (block.ordered ? h.ol : h.ul)(
        [],
        block.items.map((item) => h.li([], inline(h, item))),
      );
    case 'quote':
      return h.blockquote([], inline(h, block.text));
    case 'rule':
      return h.hr([]);
    case 'paragraph':
      return h.p([], inline(h, block.text));
  }
};

export const markdown = (h: H, text: string, id?: string): Html =>
  h.div(
    [h.Class('body md'), ...(id === undefined ? [] : [h.Id(id)])],
    parseBlocks(text).map((block) => renderBlock(h, block)),
  );
