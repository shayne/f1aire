import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { RuntimePreparing } from './RuntimePreparing.js';

describe('RuntimePreparing', () => {
  it('renders progress text', async () => {
    const { lastFrame, unmount } = await renderTui(
      <RuntimePreparing message="Preparing Python runtime" />,
    );
    expect(lastFrame()).toContain('Preparing Python runtime');
    unmount();
  });

  it('renders download progress details', async () => {
    const { lastFrame, unmount } = await renderTui(
      <RuntimePreparing
        message="Downloading Python runtime..."
        progress={{
          phase: 'downloading',
          downloadedBytes: 5 * 1024 * 1024,
          totalBytes: 10 * 1024 * 1024,
        }}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[==========----------]');
    expect(frame).toContain('50%');
    expect(frame).toContain('5.0MB / 10.0MB');
    unmount();
  });
});
