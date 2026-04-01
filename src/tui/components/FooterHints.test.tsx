import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { FooterHints } from './FooterHints.js';

const engineerFooterHint =
  'enter send · shift+enter newline · TAB details · pgup/pgdn scroll/live · esc back · ctrl+c quit';
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

describe('FooterHints', () => {
  it('includes settings hint on non-chat screens', async () => {
    const { lastFrame, unmount } = await renderTui(
      <FooterHints screen="season" />,
    );
    expect(lastFrame()).toContain('s settings');
    unmount();
  });

  it('does not include settings hint on engineer screen', async () => {
    const { lastFrame, unmount } = await renderTui(
      <FooterHints screen="engineer" />,
      { columns: 120, rows: 8 },
    );
    expect(lastFrame()).not.toContain('s settings');
    unmount();
  });

  it('documents the current engineer controls', async () => {
    const { lastFrame, unmount } = await renderTui(
      <FooterHints screen="engineer" />,
    );
    expect(normalizeWhitespace(lastFrame() ?? '')).toBe(engineerFooterHint);
    unmount();
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
