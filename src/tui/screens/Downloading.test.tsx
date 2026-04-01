import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { Downloading } from './Downloading.js';

describe('Downloading', () => {
  it('renders the selected session context in a task state panel', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Downloading
        meeting={{ Key: 1, Name: 'Bahrain GP', Location: 'Sakhir', Sessions: [] }}
        session={{
          Key: 2,
          Name: 'Practice 1',
          Type: 'Practice',
          StartDate: '2026-01-01T00:00:00Z',
          EndDate: '2026-01-01T01:00:00Z',
          GmtOffset: '+00:00',
        }}
        onStart={vi.fn().mockResolvedValue('/tmp/data')}
        onComplete={vi.fn()}
      />,
      { columns: 90, rows: 20 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Preparing session');
    expect(frame).toContain('Bahrain GP');
    expect(frame).toContain('Practice 1');
    unmount();
  });
});
