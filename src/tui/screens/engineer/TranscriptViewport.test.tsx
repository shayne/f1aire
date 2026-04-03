import React from 'react';
import { describe, expect, it } from 'vitest';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
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
  it('renders the visible transcript rows in the main transcript surface', async () => {
    const { lastFrame, unmount } = await renderTui(
      <TranscriptViewport rows={rows} scrollHint={null} />,
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('older update');
    expect(frame).toContain('newer update');
    unmount();
  });

  it('keeps paused scroll chrome out of the transcript rows', async () => {
    const { lastFrame, unmount } = await renderTui(
      <TranscriptViewport
        rows={rows.slice(-1)}
        scrollHint="Viewing earlier output · pgdn to return live"
      />,
    );

    const frame = lastFrame() ?? '';

    expect(frame).not.toContain('Viewing earlier output');
    expect(frame).not.toContain('Jump to bottom');
    expect(frame).toContain('newer update');
    unmount();
  });

  it('renders only the visible row slice between top and bottom spacers', async () => {
    const { lastFrame, unmount } = await renderTui(
      <TranscriptViewport
        rows={[
          {
            key: 'window-row',
            kind: 'message-line',
            plainText: 'window row',
            node: <Text>window row</Text>,
          },
        ]}
        topSpacerRows={40}
        bottomSpacerRows={80}
        scrollHint={null}
      />,
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('window row');
    expect(frame).not.toContain('older update');
    expect(frame).not.toContain('newer update');
    unmount();
  });
});
