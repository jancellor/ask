import chalk from 'chalk';
import type { Theme } from 'cli-highlight';
import type { TerminalRendererOptions } from 'marked-terminal';

// Mapped from node_modules/highlight.js/styles/vs2015.css.
// The base .hljs background (#1E1E1E) is not represented here because
// cli-highlight themes style tokens, not the surrounding code block.
// CSS values normalized for explicitness:
// - gold -> #FFD700
// - #600 -> #660000
// Fallback-derived keys (no explicit color in the source CSS):
// - default: base foreground
// - code: base foreground (.hljs-code is commented out upstream)
// - emphasis: base foreground + italic
// - strong: base foreground + bold
const BASE_FG = '#DCDCDC';
const KEYWORD = '#569CD6';
const BUILT_IN = '#4EC9B0';
const NUMBER = '#B8D7A3';
const STRING = '#D69D85';
const REGEXP = '#9A5334';
const COMMENT = '#57A64A';
const DOCTAG = '#608B4E';
const META = '#9B9B9B';
const VARIABLE = '#BD63C5';
const ATTRIBUTE = '#9CDCFE';
const SECTION = '#FFD700';
const SELECTOR = '#D7BA7D';
const ADDITION_BG = '#144212';
const DELETION_BG = '#660000';

const theme: Theme = {
  keyword: chalk.hex(KEYWORD),
  built_in: chalk.hex(BUILT_IN),
  type: chalk.hex(BUILT_IN),
  literal: chalk.hex(KEYWORD),
  number: chalk.hex(NUMBER),
  regexp: chalk.hex(REGEXP),
  string: chalk.hex(STRING),
  subst: chalk.hex(BASE_FG),
  symbol: chalk.hex(KEYWORD),
  class: chalk.hex(NUMBER),
  function: chalk.hex(BASE_FG),
  title: chalk.hex(BASE_FG),
  params: chalk.hex(BASE_FG),
  comment: chalk.hex(COMMENT).italic,
  doctag: chalk.hex(DOCTAG),
  meta: chalk.hex(META),
  'meta-keyword': chalk.hex(META),
  'meta-string': chalk.hex(STRING),
  section: chalk.hex(SECTION),
  tag: chalk.hex(META),
  name: chalk.hex(KEYWORD),
  'builtin-name': chalk.hex(ATTRIBUTE),
  attr: chalk.hex(ATTRIBUTE),
  attribute: chalk.hex(ATTRIBUTE),
  variable: chalk.hex(VARIABLE),
  bullet: chalk.hex(SELECTOR),
  code: chalk.hex(BASE_FG),
  emphasis: chalk.hex(BASE_FG).italic,
  strong: chalk.hex(BASE_FG).bold,
  formula: chalk.hex(BASE_FG),
  link: chalk.hex(KEYWORD).underline,
  quote: chalk.hex(COMMENT).italic,
  'selector-tag': chalk.hex(SELECTOR),
  'selector-id': chalk.hex(SELECTOR),
  'selector-class': chalk.hex(SELECTOR),
  'selector-attr': chalk.hex(SELECTOR),
  'selector-pseudo': chalk.hex(SELECTOR),
  'template-tag': chalk.hex(REGEXP),
  'template-variable': chalk.hex(VARIABLE),
  addition: chalk.bgHex(ADDITION_BG).hex(BASE_FG),
  deletion: chalk.bgHex(DELETION_BG).hex(BASE_FG),
  default: chalk.hex(BASE_FG),
};

export const options: TerminalRendererOptions = {
  code: chalk.hex(BASE_FG),
  codespan: chalk.hex(STRING),
  blockquote: chalk.hex(COMMENT).italic,
  heading: chalk.hex(KEYWORD).bold,
  firstHeading: chalk.hex(ATTRIBUTE).bold,
  strong: chalk.hex(BUILT_IN).bold,
  em: chalk.hex(BUILT_IN).italic,
  del: chalk.hex(META).strikethrough,
  link: chalk.hex(KEYWORD),
  href: chalk.hex(KEYWORD).underline,
  html: chalk.hex(META),
  hr: chalk.hex(META),
  listitem: chalk.hex(BASE_FG),
  table: chalk.hex(BASE_FG),
  paragraph: chalk.hex(BASE_FG),
  emoji: true,
  showSectionPrefix: true,
  reflowText: false,
  width: 80,
  tab: 2,
  tableOptions: {
    style: {
      // cli-table3 uses @colors/colors style names here, not Chalk/hex values.
      head: ['blue', 'bold'],
      border: ['grey'],
    },
  },
};

export const highlightOptions = {
  theme,
};
