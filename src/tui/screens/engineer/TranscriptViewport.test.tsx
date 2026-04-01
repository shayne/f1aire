import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { TranscriptRow } from './transcript-rows.js';
import { TranscriptViewport } from './TranscriptViewport.js';

const rows: TranscriptRow[] = [
  {
    key: 'older',
    kind: 'message-line',
    plainText: 'older update',
    node: <Text>older update</Text>,
  },
  {
    key: 'newer',
    kind: 'message-line',
    plainText: 'newer update',
    node: <Text>newer update</Text>,
  },
];

describe('TranscriptViewport', () => {
  it('renders the visible transcript rows in the main transcript surface', () => {
    const { lastFrame } = render(
      <TranscriptViewport visibleRows={rows} scrollHint={null} />,
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('older update');
    expect(frame).toContain('newer update');
  });

  it('renders the scroll hint above the transcript when follow mode is paused', () => {
    const { lastFrame } = render(
      <TranscriptViewport
        visibleRows={rows.slice(-1)}
        scrollHint="Viewing earlier output · pgdn to return live"
      />,
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('Viewing earlier output');
    expect(frame).toContain('newer update');
  });
});
