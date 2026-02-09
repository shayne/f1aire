import { describe, expect, it } from 'vitest';
import { renderMarkdownToTerminal } from './terminal-markdown.js';

const ANSI_SGR_REGEX = /\x1b\[[0-9;]*m/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_SGR_REGEX, '');
}

describe('renderMarkdownToTerminal', () => {
  it('renders inline markdown inside list items without literal markers', () => {
    const rendered = stripAnsi(
      renderMarkdownToTerminal(
        '* Step change: **+0.44 s** and `code` sample.',
        80,
      ),
    );

    expect(rendered).toContain('Step change: +0.44 s and code sample.');
    expect(rendered).not.toContain('**+0.44 s**');
    expect(rendered).not.toContain('`code`');
  });
});
