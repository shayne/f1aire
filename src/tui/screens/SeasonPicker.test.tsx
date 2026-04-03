import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { SeasonPicker } from './SeasonPicker.js';

describe('SeasonPicker', () => {
  it('shows first-run f1aire branding and concise next-step copy on a narrow terminal', async () => {
    const { lastFrame, unmount } = await renderTui(
      <SeasonPicker onSelect={vi.fn()} />,
      { columns: 72, rows: 20 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Select a season');
    expect(frame).toContain('f1aire');
    expect(frame).toContain('Choose a championship year');
    expect(frame).toContain('Load race weekends');
    expect(frame).not.toContain('╭');
    unmount();
  });
});
