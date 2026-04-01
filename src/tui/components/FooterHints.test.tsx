import { describe, expect, it } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { FooterHints } from './FooterHints.js';

const engineerFooterHint =
  'enter send · shift+enter newline · TAB details · pgup/pgdn scroll/live · esc back · ctrl+c quit';

describe('FooterHints', () => {
  it('includes settings hint on non-chat screens', () => {
    const { lastFrame } = render(<FooterHints screen="season" />);
    expect(lastFrame()).toContain('s settings');
  });

  it('does not include settings hint on engineer screen', () => {
    const { lastFrame } = render(<FooterHints screen="engineer" />);
    expect(lastFrame()).not.toContain('s settings');
  });

  it('documents the current engineer controls', () => {
    const { lastFrame } = render(<FooterHints screen="engineer" />);
    expect(lastFrame()?.trim()).toBe(engineerFooterHint);
  });

  it('reports the number of footer rows needed for common terminal widths', async () => {
    const footerHintsModule = (await import('./FooterHints.js')) as Record<
      string,
      unknown
    >;
    const getFooterHintRowCount = footerHintsModule.getFooterHintRowCount as
      | ((screen: string, width: number) => number)
      | undefined;

    expect(getFooterHintRowCount?.('engineer', 80)).toBe(2);
    expect(getFooterHintRowCount?.('engineer', 120)).toBe(1);
  });
});
