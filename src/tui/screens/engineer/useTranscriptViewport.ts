import { useInput } from 'ink';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export function reconcilePausedOffset({
  previousRowCount,
  nextRowCount,
  currentScrollOffsetLines,
  visibleLineCount,
}: {
  previousRowCount: number;
  nextRowCount: number;
  currentScrollOffsetLines: number;
  visibleLineCount: number;
}): number {
  const nextMaxScrollLines = Math.max(nextRowCount - visibleLineCount, 0);

  if (
    previousRowCount > 0 &&
    nextRowCount > previousRowCount &&
    currentScrollOffsetLines > 0
  ) {
    return Math.min(
      currentScrollOffsetLines + (nextRowCount - previousRowCount),
      nextMaxScrollLines,
    );
  }

  return Math.min(currentScrollOffsetLines, nextMaxScrollLines);
}

export function getTranscriptWindow({
  rowCount,
  visibleLineCount,
  scrollOffsetLines,
}: {
  rowCount: number;
  visibleLineCount: number;
  scrollOffsetLines: number;
}): { start: number; end: number } {
  const start = Math.max(rowCount - visibleLineCount - scrollOffsetLines, 0);
  const end = Math.min(start + visibleLineCount, rowCount);
  return { start, end };
}

export function getTranscriptScrollHint({
  isScrolledUp,
  hasUpdatesBelow,
}: {
  isScrolledUp: boolean;
  hasUpdatesBelow: boolean;
}): string | null {
  if (!isScrolledUp) return null;
  return hasUpdatesBelow
    ? 'New updates below · pgdn to catch up'
    : 'Viewing earlier output · pgdn to return live';
}

export function useTranscriptViewport({
  rowCount,
  visibleLineCount,
  transcriptVersion,
}: {
  rowCount: number;
  visibleLineCount: number;
  transcriptVersion: number;
}): {
  window: { start: number; end: number };
  setScrollOffsetLines: Dispatch<SetStateAction<number>>;
  maxScrollLines: number;
  scrollHint: string | null;
  markPaused: () => void;
  jumpToLatest: () => void;
} {
  const [scrollOffsetLines, setScrollOffsetLines] = useState(0);
  const previousRowCountRef = useRef(0);
  const pausedTranscriptVersionRef = useRef<number | null>(null);
  const maxScrollLines = Math.max(rowCount - visibleLineCount, 0);
  const effectiveScrollOffsetLines = Math.min(
    scrollOffsetLines,
    maxScrollLines,
  );
  const isScrolledUp = effectiveScrollOffsetLines > 0;
  const hasUpdatesBelow =
    pausedTranscriptVersionRef.current !== null &&
    pausedTranscriptVersionRef.current < transcriptVersion;
  const window = getTranscriptWindow({
    rowCount,
    visibleLineCount,
    scrollOffsetLines: effectiveScrollOffsetLines,
  });
  const scrollHint = getTranscriptScrollHint({
    isScrolledUp,
    hasUpdatesBelow,
  });

  useLayoutEffect(() => {
    const previousRowCount = previousRowCountRef.current;
    previousRowCountRef.current = rowCount;
    setScrollOffsetLines((current) =>
      reconcilePausedOffset({
        previousRowCount,
        nextRowCount: rowCount,
        currentScrollOffsetLines: current,
        visibleLineCount,
      }),
    );
    if (scrollOffsetLines === 0 || maxScrollLines === 0) {
      pausedTranscriptVersionRef.current = null;
    }
  }, [maxScrollLines, rowCount, scrollOffsetLines, visibleLineCount]);

  const scrollStep = Math.max(1, Math.floor(visibleLineCount * 0.7));

  useInput((_, key) => {
    if (key.pageUp) {
      if (effectiveScrollOffsetLines === 0) {
        pausedTranscriptVersionRef.current = transcriptVersion;
      }
      setScrollOffsetLines((current) =>
        Math.min(current + scrollStep, maxScrollLines),
      );
      return;
    }
    if (key.pageDown) {
      if (effectiveScrollOffsetLines <= scrollStep) {
        pausedTranscriptVersionRef.current = null;
      }
      setScrollOffsetLines((current) => Math.max(current - scrollStep, 0));
    }
  });

  const markPaused = () => {
    pausedTranscriptVersionRef.current = transcriptVersion;
  };

  const jumpToLatest = () => {
    pausedTranscriptVersionRef.current = null;
    setScrollOffsetLines(0);
  };

  return {
    window,
    setScrollOffsetLines,
    maxScrollLines,
    scrollHint,
    markPaused,
    jumpToLatest,
  };
}
