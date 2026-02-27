import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

marked.setOptions({
  renderer: new TerminalRenderer({
    code: chalk.hex('#D8DEE9'),
    codespan: chalk.hex('#B7A7FF'),
    blockquote: chalk.hex('#7D85A8').italic,
    heading: chalk.hex('#69A9FF').bold,
    firstHeading: chalk.hex('#8DC2FF').bold,
    strong: chalk.hex('#F0F3FF').bold,
    em: chalk.hex('#8E96B8').italic,
    del: chalk.hex('#6A7192').strikethrough,
    link: chalk.hex('#7AA8FF'),
    href: chalk.hex('#7AA8FF').underline,
    html: chalk.hex('#7B84A7'),
    hr: chalk.hex('#4A5070'),
    listitem: chalk.hex('#C5CCE1'),
    table: chalk.hex('#C5CCE1'),
    paragraph: chalk.reset,
    emoji: true,
    showSectionPrefix: true,
    reflowText: false,
    width: 80,
    tab: 2,
  }) as any,
});

export function parseMarkdown(text: string): string {
  const rendered = marked.parse(text) as string;
  return rendered.replace(/(?:\r?\n){1,2}$/, '');
}
