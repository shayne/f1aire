import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { SeasonPicker } from './SeasonPicker.js';

describe('SeasonPicker', () => {
  it('shows the active task and supporting copy without clipping on a narrow terminal', async () => {
    const { lastFrame, unmount } = await renderTui(
      <SeasonPicker onSelect={vi.fn()} />,
      { columns: 72, rows: 20 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Select a season');
    expect(frame).toContain('Start with a season');
    expect(frame).not.toContain('╭');
    unmount();
  });
});
