import { describe, expect, it } from 'vitest';
import React from 'react';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import { ScreenLayout } from './ScreenLayout.js';

describe('ScreenLayout', () => {
  it('stacks the detail panel below the main content on narrow terminals', async () => {
    const { lastFrame, unmount } = await renderTui(
      <ScreenLayout
        title="Select a season"
        main={<Text>main pane</Text>}
        detail={<Text>detail pane</Text>}
      />,
      { columns: 64, rows: 20 },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Select a season');
    expect(frame.indexOf('main pane')).toBeLessThan(frame.indexOf('detail pane'));
    unmount();
  });

  it('keeps the main and detail panes side by side on wide terminals', async () => {
    const { lastFrame, unmount } = await renderTui(
      <ScreenLayout
        title="Select a season"
        main={<Text>main pane</Text>}
        detail={<Text>detail pane</Text>}
      />,
      { columns: 120, rows: 20 },
    );

    const frame = lastFrame() ?? '';
    const mainLine = frame
      .split('\n')
      .find((line) => line.includes('main pane') && line.includes('detail pane'));

    expect(mainLine).toBeDefined();
    unmount();
  });
});
