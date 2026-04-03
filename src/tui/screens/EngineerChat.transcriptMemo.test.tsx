import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';

const transcriptRowBuilders = vi.hoisted(() => ({
  buildHistoricalTranscriptRows: vi.fn(),
  buildLiveTranscriptRows: vi.fn(),
}));

vi.mock('./engineer/transcript-rows.js', async () => {
  const actual = await vi.importActual<
    typeof import('./engineer/transcript-rows.js')
  >('./engineer/transcript-rows.js');

  return {
    ...actual,
    buildHistoricalTranscriptRows:
      transcriptRowBuilders.buildHistoricalTranscriptRows,
    buildLiveTranscriptRows: transcriptRowBuilders.buildLiveTranscriptRows,
  };
});

const { EngineerChat } = await import('./EngineerChat.js');

const baseProps = {
  messages: [
    { role: 'user' as const, content: 'Compare stint pace.' },
    { role: 'assistant' as const, content: 'Initial answer.' },
  ],
  onSend: vi.fn(),
  streamingText: 'chunk 1',
  isStreaming: true,
  status: null as string | null,
  year: 2025,
  meeting: {
    Key: 1,
    Name: 'Test GP',
    Location: 'Nowhere',
    Sessions: [],
  },
  session: {
    Key: 10,
    Name: 'Race',
    Type: 'Race',
    StartDate: '2025-01-01T00:00:00Z',
    EndDate: '2025-01-01T02:00:00Z',
    GmtOffset: '+00:00',
  },
  summary: null,
  activity: [] as string[],
  maxHeight: 18,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('EngineerChat transcript memoization', () => {
  beforeEach(() => {
    transcriptRowBuilders.buildHistoricalTranscriptRows.mockReset();
    transcriptRowBuilders.buildHistoricalTranscriptRows.mockReturnValue([]);
    transcriptRowBuilders.buildLiveTranscriptRows.mockReset();
    transcriptRowBuilders.buildLiveTranscriptRows.mockReturnValue([]);
  });

  it('does not rebuild historical rows when only streaming text changes', async () => {
    const app = await renderTui(<EngineerChat {...baseProps} />);

    await tick();

    app.rerender(<EngineerChat {...baseProps} streamingText="chunk 2" />);
    await tick();

    expect(
      transcriptRowBuilders.buildHistoricalTranscriptRows,
    ).toHaveBeenCalledTimes(1);
    expect(transcriptRowBuilders.buildLiveTranscriptRows).toHaveBeenCalledTimes(
      2,
    );

    app.unmount();
  });
});
