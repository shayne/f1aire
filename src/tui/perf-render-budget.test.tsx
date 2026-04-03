import React from 'react';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderBudgetLogger } from './perf.js';

const transcriptRowBuilders = vi.hoisted(() => ({
  buildHistoricalTranscriptRows: vi.fn(),
  buildLiveTranscriptRows: vi.fn(),
}));

vi.mock('./screens/engineer/transcript-rows.js', async () => {
  const actual = await vi.importActual<
    typeof import('./screens/engineer/transcript-rows.js')
  >('./screens/engineer/transcript-rows.js');

  return {
    ...actual,
    buildHistoricalTranscriptRows:
      transcriptRowBuilders.buildHistoricalTranscriptRows,
    buildLiveTranscriptRows: transcriptRowBuilders.buildLiveTranscriptRows,
  };
});

const { EngineerChat } = await import('./screens/EngineerChat.js');

const meeting = {
  Key: 1,
  Name: 'Monaco Grand Prix',
  Location: 'Monaco',
  Sessions: [],
};

const session = {
  Key: 10,
  Name: 'Race',
  Type: 'Race',
  StartDate: '2025-05-25T13:00:00Z',
  EndDate: '2025-05-25T15:00:00Z',
  GmtOffset: '+00:00',
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createRenderBudgetLogger', () => {
  it('emits a render-budget warning only when measured work exceeds the budget', () => {
    let nowMs = 100;
    const write = vi.fn();
    const measureRender = createRenderBudgetLogger({
      warnMs: 8,
      now: () => nowMs,
      write,
    });

    const withinBudget = measureRender(() => {
      nowMs += 7;
      return 'fast';
    });

    const overBudget = measureRender(() => {
      nowMs += 9;
      return 'slow';
    });

    expect(withinBudget).toBe('fast');
    expect(overBudget).toBe('slow');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({
      type: 'render-budget',
      durationMs: 9,
    });
  });
});

describe('EngineerChat render budget', () => {
  beforeEach(() => {
    transcriptRowBuilders.buildHistoricalTranscriptRows.mockReset();
    transcriptRowBuilders.buildLiveTranscriptRows.mockReset();
  });

  it('keeps one streaming delta from re-rendering every historical transcript row', async () => {
    const onHistoricalRowRender = vi.fn();
    const messages = Array.from({ length: 240 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `historical message ${index + 1}`,
    }));

    function HistoricalRowProbe({ text }: { text: string }) {
      onHistoricalRowRender();
      return <Text wrap="truncate-end">{text}</Text>;
    }

    transcriptRowBuilders.buildHistoricalTranscriptRows.mockImplementation(
      ({ messages: historicalMessages }) =>
        historicalMessages.map((message, index) => ({
          key: `historical-${index}`,
          kind: 'message-line',
          plainText: message.content,
          node: (
            <HistoricalRowProbe
              key={`historical-node-${index}`}
              text={message.content}
            />
          ),
        })),
    );
    transcriptRowBuilders.buildLiveTranscriptRows.mockImplementation(
      ({ streamingText }) =>
        streamingText
          ? [
              {
                key: 'live-stream',
                kind: 'message-line',
                plainText: streamingText,
                node: <Text wrap="truncate-end">{streamingText}</Text>,
              },
            ]
          : [],
    );

    const rendered = await renderTui(
      <EngineerChat
        messages={messages}
        onSend={() => {}}
        streamingText=""
        isStreaming={false}
        status={null}
        year={2025}
        meeting={meeting}
        session={session}
        summary={null}
        activity={[]}
        asOfLabel="Latest"
        maxHeight={320}
      />,
    );

    await tick();
    onHistoricalRowRender.mockClear();

    rendered.rerender(
      <EngineerChat
        messages={messages}
        onSend={() => {}}
        streamingText="fresh delta"
        isStreaming
        status="Thinking..."
        year={2025}
        meeting={meeting}
        session={session}
        summary={null}
        activity={['Thinking...']}
        asOfLabel="Latest"
        maxHeight={320}
      />,
    );

    await tick();

    expect(onHistoricalRowRender.mock.calls.length).toBeLessThan(20);
    rendered.unmount();
  });
});
