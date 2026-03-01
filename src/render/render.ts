import { highlight } from 'cli-highlight';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { themes } from './themes.js';

const { highlightOptions, options, prompt, colors } = themes.catppuccinMocha;

// marked-terminal still types this as old CardinalOptions, but its current
// implementation forwards the object to cli-highlight unchanged.
const markedHighlightOptions = highlightOptions as any;

marked.setOptions({
  renderer: new TerminalRenderer(options, markedHighlightOptions) as any,
});

export function renderMarkdown(text: string): string {
  const rendered = marked.parse(text) as string;
  return rendered.replace(/(?:\r?\n){1,2}$/, '');
}

export function renderShellScript(text: string): string {
  return highlight(text, { language: 'bash', ...highlightOptions });
}

export const renderPrompt = prompt;
export { colors };
