import { readFileSync, writeFileSync } from 'node:fs';

const USED = {
  compact: 'fold-vertical',
  pause: 'pause',
  fork: 'git-fork',
  size: 'cpu',
  history: 'history',
  files: 'folder',
  computer: 'monitor',
  check: 'check',
  square: 'square',
  rename: 'pencil',
  archive: 'archive',
  trash: 'trash-2',
  share: 'share-2',
  settings: 'settings',
  close: 'x',
  menu: 'menu',
  more: 'ellipsis',
  plus: 'plus',
  send: 'arrow-up',
  down: 'arrow-down',
  back: 'arrow-left',
  forward: 'arrow-right',
  reload: 'rotate-cw',
  caret: 'chevron-right',
  folder: 'folder',
  terminal: 'terminal',
  browser: 'globe',
};

const inner = (name) => {
  const svg = readFileSync(`node_modules/lucide-static/icons/${name}.svg`, 'utf8');
  return svg
    .slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'))
    .replace(/\s+/g, ' ')
    .trim();
};

const icons = Object.fromEntries(Object.entries(USED).map(([key, name]) => [key, inner(name)]));
const version = JSON.parse(readFileSync('node_modules/lucide-static/package.json', 'utf8')).version;

writeFileSync(
  'src/ui/icons.generated.ts',
  `export const ICON_SOURCE = ${JSON.stringify(`lucide-static ${version} (ISC)`)};\nexport const ICONS: Record<string, string> = ${JSON.stringify(icons, null, 2)};\n`,
);
console.log(`icons ${Object.keys(icons).length} from lucide-static ${version}`);
