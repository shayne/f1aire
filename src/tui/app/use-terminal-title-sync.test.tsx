import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { useTerminalTitleSync } from './use-terminal-title-sync.js';

describe('useTerminalTitleSync', () => {
  it('writes a route-aware title through the injected writer', async () => {
    const writeTitle = vi.fn();

    function Probe() {
      useTerminalTitleSync({
        screenName: 'engineer',
        isStreaming: true,
        summaryTitle: '2025 Monaco Grand Prix · Race',
        writeTitle,
      });
      return null;
    }

    render(<Probe />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeTitle).toHaveBeenCalledWith(expect.stringContaining('F1aire'));
    expect(writeTitle).toHaveBeenCalledWith(
      expect.stringContaining('2025 Monaco Grand Prix · Race'),
    );
  });
});
