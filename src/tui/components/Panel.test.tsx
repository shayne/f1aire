import { describe, expect, it } from 'vitest';
import React from 'react';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import { Panel } from './Panel.js';

describe('Panel', () => {
  it('renders lighter framing without an empty title gap', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Panel title="Session" tone="muted">
        <Text>body copy</Text>
      </Panel>,
      { columns: 60, rows: 10 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Session');
    expect(frame).toContain('body copy');
    expect(frame).not.toContain('╭');
    expect(frame).not.toContain('╰');
    unmount();
  });
});
