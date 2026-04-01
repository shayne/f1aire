import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import { useTranscriptViewport } from './useTranscriptViewport.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const waitForTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function Harness({
  rowCount,
  transcriptHeight,
  transcriptVersion,
  onRender,
}: {
  rowCount: number;
  transcriptHeight: number;
  transcriptVersion: number;
  onRender: (value: ReturnType<typeof useTranscriptViewport>) => void;
}) {
  const value = useTranscriptViewport({
    rowCount,
    transcriptHeight,
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
    const { stdin, lastFrame, unmount } = await renderTui(
      <Harness
        rowCount={18}
        transcriptHeight={8}
        transcriptVersion={1}
        onRender={vi.fn()}
      />,
    );

    await waitForTick();
    expect(lastFrame()).toContain('10:18:10');

    stdin.write('\u001b[5~');
    await waitForTick();
    expect(lastFrame()).toContain('6:13:11');

    stdin.write('\u001b[6~');
    await waitForTick();
    expect(lastFrame()).toContain('10:18:10');
    unmount();
  });

  it('preserves the same slice while paused, then jumps back to live', async () => {
    let viewport: ReturnType<typeof useTranscriptViewport> | null = null;
    const onRender = vi.fn(
      (value: ReturnType<typeof useTranscriptViewport>) => {
        viewport = value;
      },
    );

    const { rerender, lastFrame, unmount } = await renderTui(
      <Harness
        rowCount={18}
        transcriptHeight={8}
        transcriptVersion={1}
        onRender={onRender}
      />,
    );

    await waitForTick();
    expect(lastFrame()).toContain('10:18:10');

    viewport?.markPaused();
    viewport?.setScrollOffsetLines(6);
    await waitForTick();

    expect(viewport?.window).toEqual({ start: 5, end: 12 });

    rerender(
      <Harness
        rowCount={21}
        transcriptHeight={8}
        transcriptVersion={2}
        onRender={onRender}
      />,
    );
    await waitForTick();

    expect(viewport?.window).toEqual({ start: 5, end: 12 });
    expect(viewport?.maxScrollLines).toBe(14);

    viewport?.jumpToLatest();
    await waitForTick();

    expect(viewport?.window).toEqual({ start: 13, end: 21 });
    unmount();
  });

  it('keeps the same top row anchored when the visible height changes while paused', async () => {
    let viewport: ReturnType<typeof useTranscriptViewport> | null = null;
    const onRender = vi.fn(
      (value: ReturnType<typeof useTranscriptViewport>) => {
        viewport = value;
      },
    );

    const { rerender, unmount } = await renderTui(
      <Harness
        rowCount={20}
        transcriptHeight={8}
        transcriptVersion={1}
        onRender={onRender}
      />,
    );

    await waitForTick();

    viewport?.markPaused();
    viewport?.setScrollOffsetLines(6);
    await waitForTick();

    expect(viewport?.window).toEqual({ start: 7, end: 14 });

    rerender(
      <Harness
        rowCount={20}
        transcriptHeight={10}
        transcriptVersion={1}
        onRender={onRender}
      />,
    );
    await waitForTick();

    expect(viewport?.window).toEqual({ start: 7, end: 16 });
    expect(viewport?.maxScrollLines).toBe(11);
    unmount();
  });
});
