import chalk from 'chalk';
import { highlight } from 'cli-highlight';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { themes } from './themes.js';

const { highlightOptions, options, prompt, colors } = themes.catppuccinMocha;

const DIFF_OLD_BG = '#220D14';
const DIFF_NEW_BG = '#0D2214';

const diffBg = {
  old: chalk.bgHex(DIFF_OLD_BG),
  new: chalk.bgHex(DIFF_NEW_BG),
};

const diffGutter = {
  old: chalk.hex('#F38BA8')('- '), // catppuccin red
  new: chalk.hex('#A6E3A1')('+ '), // catppuccin green
};

// marked-terminal still types this as old CardinalOptions, but its current
// implementation forwards the object to cli-highlight unchanged.
const markedHighlightOptions = highlightOptions as any;

marked.use(markedTerminal(options, markedHighlightOptions) as any);

// Fix: for tight list items, marked-terminal's `text` renderer returns the raw
// markdown string (token.text) instead of parsing inline tokens, so **bold**,
// *italic* and `code` appear as literal punctuation inside bullet points.
// Returning false falls through to the marked-terminal handler for other cases.
marked.use({
  renderer: {
    text(token: any) {
      if (token?.tokens) {
        return (this as any).parser.parseInline(token.tokens);
      }
      return false;
    },
  },
} as any);

export function renderMarkdown(text: string): string {
  const rendered = marked.parse(text) as string;
  return rendered.replace(/(?:\r?\n){1,2}$/, '');
}

// Apply a background colour to a syntax-highlighted string.
// Replaces full ANSI resets with foreground-only resets so the background persists across tokens.
let withBackground = (highlighted: string, bg: (s: string) => string) =>
  bg(highlighted.replace(/\x1b\[0m/g, '\x1b[39m'));

export function renderShellScript(text: string): string {
  const heredocRegex = /<<'(\w+)'\n([\s\S]*?)\n\1(?=\n|$)/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = heredocRegex.exec(text)) !== null) {
    const delimiter = match[1];
    const content = match[2];
    const contentStart = match.index + `<<'${delimiter}'\n`.length;
    const contentEnd = contentStart + content.length;

    // Bash segment up to and including the opener line
    result += highlight(text.slice(lastIndex, contentStart), {
      language: 'bash',
      ...highlightOptions,
    });
    // Heredoc content — diff blocks get background coloring, others autodetect
    if (delimiter === 'OLD_EOF' || delimiter === 'NEW_EOF') {
      const gutter = delimiter === 'OLD_EOF' ? diffGutter.old : diffGutter.new;
      const bg = delimiter === 'OLD_EOF' ? diffBg.old : diffBg.new;
      const body = highlight(content, highlightOptions)
        .split('\n')
        .map((l) => gutter + l)
        .join('\n');
      result += withBackground(body, bg);
    } else {
      result += highlight(content, highlightOptions);
    }

    lastIndex = contentEnd;
  }

  // Remaining text (the closing delimiter + anything after, or all text if no heredocs)
  result += highlight(text.slice(lastIndex), {
    language: 'bash',
    ...highlightOptions,
  });

  return result;
}

export const renderPrompt = prompt;
export { colors };
