import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { SessionPicker } from './SessionPicker.js';

describe('SessionPicker', () => {
  it('keeps the session list and details readable in the shared shell on narrow terminals', async () => {
    const { lastFrame, unmount } = await renderTui(
      <SessionPicker
        meeting={{
          Key: 1,
          Name: 'Monaco GP',
          Location: 'Monte Carlo',
          Sessions: [
            {
              Key: 2,
              Name: 'Qualifying',
              Type: 'Qualifying',
              StartDate: '2026-05-23T14:00:00Z',
              EndDate: '2026-05-23T15:00:00Z',
              GmtOffset: '+00:00',
            },
          ],
        }}
        onSelect={vi.fn()}
      />,
      { columns: 72, rows: 20 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Select a session');
    expect(frame).toContain('Download a Monaco GP session');
    expect(frame).toContain('Qualifying');
    expect(frame).not.toContain('╭');
    expect(frame.indexOf('Qualifying (Qualifying)')).toBeLessThan(
      frame.lastIndexOf('Qualifying'),
    );
    unmount();
  });
});
