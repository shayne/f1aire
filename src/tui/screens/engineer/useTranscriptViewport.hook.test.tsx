import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'ink';
import { useTranscriptViewport } from './useTranscriptViewport.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const waitForTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function Harness({
  rowCount,
  visibleLineCount,
  transcriptVersion,
  onRender,
}: {
  rowCount: number;
  visibleLineCount: number;
  transcriptVersion: number;
  onRender: (value: ReturnType<typeof useTranscriptViewport>) => void;
}) {
  const value = useTranscriptViewport({
    rowCount,
    visibleLineCount,
    transcriptVersion,
  });

  onRender(value);

  return (
    <Text>
      {`${value.window.start}:${value.window.end}:${value.maxScrollLines}`}
    </Text>
  );
}

describe('useTranscriptViewport', () => {
  it('responds to PageUp and PageDown keyboard input', async () => {
    const { stdin, lastFrame } = render(
      <Harness
        rowCount={18}
        visibleLineCount={8}
        transcriptVersion={1}
        onRender={vi.fn()}
      />,
    );

    await waitForTick();
    expect(lastFrame()).toContain('10:18:10');

    stdin.write('\u001b[5~');
    await waitForTick();
    expect(lastFrame()).toContain('5:13:10');

    stdin.write('\u001b[6~');
    await waitForTick();
    expect(lastFrame()).toContain('10:18:10');
  });

  it('preserves the same slice while paused, then jumps back to live', async () => {
    let viewport: ReturnType<typeof useTranscriptViewport> | null = null;
    const onRender = vi.fn(
      (value: ReturnType<typeof useTranscriptViewport>) => {
        viewport = value;
      },
    );

    const { rerender, lastFrame } = render(
      <Harness
        rowCount={18}
        visibleLineCount={8}
        transcriptVersion={1}
        onRender={onRender}
      />,
    );

    await waitForTick();
    expect(lastFrame()).toContain('10:18:10');

    viewport?.markPaused();
    viewport?.setScrollOffsetLines(6);
    await waitForTick();

    expect(viewport?.window).toEqual({ start: 4, end: 12 });

    rerender(
      <Harness
        rowCount={21}
        visibleLineCount={8}
        transcriptVersion={2}
        onRender={onRender}
      />,
    );
    await waitForTick();

    expect(viewport?.window).toEqual({ start: 4, end: 12 });
    expect(viewport?.maxScrollLines).toBe(13);

    viewport?.jumpToLatest();
    await waitForTick();

    expect(viewport?.window).toEqual({ start: 13, end: 21 });
  });
});
