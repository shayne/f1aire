import { describe, expect, it } from 'vitest';
import React from 'react';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import { ScreenLayout } from './ScreenLayout.js';

describe('ScreenLayout', () => {
  it('keeps the primary pane visible and stacks details below it on narrow terminals', async () => {
    const { lastFrame, unmount } = await renderTui(
      <ScreenLayout
        columns={72}
        title="Select a season"
        subtitle="Start a f1aire session by picking a championship year."
        primary={<Text>Season picker</Text>}
        details={<Text>Season details</Text>}
        footer={<Text>Press Enter to continue</Text>}
      />,
      { columns: 64, rows: 20 },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Select a season');
    expect(frame).toContain(
      'Start a f1aire session by picking a championship year.',
    );
    expect(frame).toContain('Season picker');
    expect(frame).toContain('Season details');
    expect(frame).toContain('Press Enter to continue');
    expect(frame.indexOf('Season picker')).toBeLessThan(
      frame.indexOf('Season details'),
    );
    unmount();
  });

  it('renders primary and details in one row on wide terminals', async () => {
    const { lastFrame, unmount } = await renderTui(
      <ScreenLayout
        columns={120}
        title="Select a season"
        subtitle="Start a f1aire session by picking a championship year."
        primary={<Text>Season picker</Text>}
        details={<Text>Season details</Text>}
      />,
      { columns: 120, rows: 20 },
    );

    const frame = lastFrame() ?? '';
    const mainLine = frame
      .split('\n')
      .find(
        (line) =>
          line.includes('Season picker') && line.includes('Season details'),
      );

    expect(mainLine).toBeDefined();
    unmount();
  });
});
