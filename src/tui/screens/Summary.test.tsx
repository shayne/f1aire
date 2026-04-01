import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { Summary } from './Summary.js';

describe('Summary', () => {
  it('renders a completion state with the session summary and data path', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Summary
        dir="/tmp/f1aire/session"
        summary={{
          winner: { name: 'Driver One', number: '1' },
          fastestLap: { name: 'Driver Two', number: '2', time: '1:30.000' },
          totalLaps: 57,
        }}
      />,
      { columns: 90, rows: 20 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Session ready');
    expect(frame).toContain('Driver One');
    expect(frame).toContain('/tmp/f1aire/session');
    unmount();
  });
});
