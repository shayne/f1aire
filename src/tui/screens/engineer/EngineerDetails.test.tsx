import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderTui } from '#ink/testing';
import { EngineerDetails } from './EngineerDetails.js';

describe('EngineerDetails', () => {
  it('renders a compact status strip and keeps expanded details hidden by default', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerDetails
        activity={['Thinking']}
        pythonCode={'print("hi")\n2 + 2'}
        isExpanded={false}
      />,
      { columns: 120, rows: 12 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Status · Thinking');
    expect(frame).not.toContain('Details');
    expect(frame).not.toContain('print("hi")');
    unmount();
  });

  it('renders the expanded panel with recent activity and python preview when requested', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerDetails
        activity={['Thinking', 'Running tool']}
        pythonCode={'import math\nprint("hi")\n2 + 2'}
        isExpanded
      />,
      { columns: 120, rows: 16 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Details');
    expect(frame).toContain('Running tool');
    expect(frame).toContain('Python');
    expect(frame).toContain('print("hi")');
    unmount();
  });
});
