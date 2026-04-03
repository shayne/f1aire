import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { MeetingPicker } from './MeetingPicker.js';

describe('MeetingPicker', () => {
  it('explains what to do when a season has no meetings', async () => {
    const { lastFrame, unmount } = await renderTui(
      <MeetingPicker year={2026} meetings={[]} onSelect={vi.fn()} />,
      { columns: 72, rows: 20 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Select a meeting');
    expect(frame).toContain('No meetings found for 2026.');
    expect(frame).toContain('Go back and choose another season.');
    unmount();
  });
});
