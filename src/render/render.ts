import { highlight } from 'cli-highlight';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { themes } from './themes.js';

const { highlightOptions, options, prompt, colors } = themes.catppuccinMocha;

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

export function renderShellScript(text: string): string {
  return highlight(text, { language: 'bash', ...highlightOptions });
}

export const renderPrompt = prompt;
export { colors };
