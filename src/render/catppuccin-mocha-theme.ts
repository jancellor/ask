import chalk from 'chalk';
import type { HighlightOptions } from 'cli-highlight';
import type { TerminalRendererOptions } from 'marked-terminal';

// Catppuccin Mocha palette
// https://github.com/catppuccin/catppuccin
//
// Token mapping rationale:
// - cli-highlight: follows Catppuccin's conventional syntax roles
//   (mauve for keywords, green for strings, peach for numbers, etc.)
// - marked-terminal: palette-driven adaptation using blue/lavender for
//   structural elements, green for inline code, overlay tones for muted roles
const TEXT = '#CDD6F4';
const SUBTEXT1 = '#BAC2DE';
const OVERLAY2 = '#9399B2';
const OVERLAY1 = '#7F849C';

const MAUVE = '#CBA6F7';
const BLUE = '#89B4FA';
const SAPPHIRE = '#74C7EC';
const LAVENDER = '#B4BEFE';
const TEAL = '#94E2D5';
const GREEN = '#A6E3A1';
const YELLOW = '#F9E2AF';
const PEACH = '#FAB387';
const MAROON = '#EBA0AC';
const RED = '#F38BA8';
const PINK = '#F5C2E7';
const FLAMINGO = '#F2CDCD';
const ROSEWATER = '#F5E0DC';

// Dark-tinted backgrounds for diff markers, derived from base (#1E1E2E)
const ADDITION_BG = '#1A3326';
const DELETION_BG = '#3B1D26';

const prompt = chalk.hex(SAPPHIRE);

const highlightOptions: HighlightOptions = {
  theme: {
    keyword: chalk.hex(MAUVE),
    built_in: chalk.hex(TEAL),
    type: chalk.hex(YELLOW),
    literal: chalk.hex(PEACH),
    number: chalk.hex(PEACH),
    regexp: chalk.hex(RED),
    string: chalk.hex(GREEN),
    subst: chalk.hex(TEXT),
    symbol: chalk.hex(FLAMINGO),
    class: chalk.hex(YELLOW),
    function: chalk.hex(BLUE),
    title: chalk.hex(BLUE),
    params: chalk.hex(TEXT),
    comment: chalk.hex(OVERLAY1).italic,
    doctag: chalk.hex(GREEN),
    meta: chalk.hex(OVERLAY2),
    'meta-keyword': chalk.hex(OVERLAY2),
    'meta-string': chalk.hex(GREEN),
    section: chalk.hex(YELLOW),
    tag: chalk.hex(MAUVE),
    name: chalk.hex(BLUE),
    'builtin-name': chalk.hex(SAPPHIRE),
    attr: chalk.hex(SAPPHIRE),
    attribute: chalk.hex(SAPPHIRE),
    variable: chalk.hex(MAROON),
    bullet: chalk.hex(PINK),
    code: chalk.hex(TEXT),
    emphasis: chalk.hex(TEXT).italic,
    strong: chalk.hex(TEXT).bold,
    formula: chalk.hex(TEXT),
    link: chalk.hex(BLUE).underline,
    quote: chalk.hex(OVERLAY1).italic,
    'selector-tag': chalk.hex(PINK),
    'selector-id': chalk.hex(PINK),
    'selector-class': chalk.hex(PINK),
    'selector-attr': chalk.hex(PINK),
    'selector-pseudo': chalk.hex(PINK),
    'template-tag': chalk.hex(ROSEWATER),
    'template-variable': chalk.hex(MAROON),
    addition: chalk.bgHex(ADDITION_BG).hex(GREEN),
    deletion: chalk.bgHex(DELETION_BG).hex(RED),
    default: chalk.hex(TEXT),
  },
};

const options: TerminalRendererOptions = {
  code: chalk.hex(TEXT),
  codespan: chalk.hex(GREEN),
  blockquote: chalk.hex(OVERLAY1).italic,
  heading: chalk.hex(BLUE).bold,
  firstHeading: chalk.hex(LAVENDER).bold,
  strong: chalk.hex(LAVENDER).bold,
  em: chalk.hex(LAVENDER).italic,
  del: chalk.hex(OVERLAY2).strikethrough,
  link: chalk.hex(BLUE),
  href: chalk.hex(BLUE).underline,
  html: chalk.hex(OVERLAY2),
  hr: chalk.hex(OVERLAY2),
  listitem: chalk.hex(TEXT),
  table: chalk.hex(TEXT),
  paragraph: chalk.hex(TEXT),
  emoji: true,
  showSectionPrefix: true,
  reflowText: false,
  width: 80,
  tab: 2,
  tableOptions: {
    style: {
      // cli-table3 uses @colors/colors style names here, not Chalk/hex values.
      head: ['magenta', 'bold'],
      border: ['grey'],
    },
  },
};

const colors = { text: TEXT, muted: OVERLAY1, error: RED };

export default {
  prompt,
  colors,
  options,
  highlightOptions,
};
