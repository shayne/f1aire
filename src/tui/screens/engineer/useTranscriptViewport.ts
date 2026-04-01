import { useInput } from 'ink';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export function reconcilePausedOffset({
  previousRowCount,
  nextRowCount,
  previousVisibleLineCount,
  nextVisibleLineCount,
  currentScrollOffsetLines,
}: {
  previousRowCount: number;
  nextRowCount: number;
  previousVisibleLineCount: number;
  nextVisibleLineCount: number;
  currentScrollOffsetLines: number;
}): number {
  const isPaused = currentScrollOffsetLines > 0;
  const previousRenderedVisibleLineCount = Math.max(
    previousVisibleLineCount - (isPaused ? 1 : 0),
    1,
  );
  const nextRenderedVisibleLineCount = Math.max(
    nextVisibleLineCount - (isPaused ? 1 : 0),
    1,
  );
  const nextMaxScrollLines = Math.max(
    nextRowCount - nextRenderedVisibleLineCount,
    0,
  );

  if (previousRowCount > 0 && isPaused) {
    const previousTopRow = Math.max(
      previousRowCount -
        previousRenderedVisibleLineCount -
        currentScrollOffsetLines,
      0,
    );
    return Math.min(
      Math.max(
        nextRowCount - nextRenderedVisibleLineCount - previousTopRow,
        0,
      ),
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
  transcriptHeight,
  transcriptVersion,
}: {
  rowCount: number;
  transcriptHeight: number;
  transcriptVersion: string | number;
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
  const previousTranscriptHeightRef = useRef(transcriptHeight);
  const pausedTranscriptVersionRef = useRef<string | number | null>(null);
  const isPaused = scrollOffsetLines > 0;
  const maxScrollLines = Math.max(
    rowCount - Math.max(transcriptHeight - (isPaused ? 1 : 0), 1),
    0,
  );
  const effectiveScrollOffsetLines = Math.min(
    scrollOffsetLines,
    maxScrollLines,
  );
  const isScrolledUp = effectiveScrollOffsetLines > 0;
  const hasUpdatesBelow =
    pausedTranscriptVersionRef.current !== null &&
    pausedTranscriptVersionRef.current !== transcriptVersion;
  const visibleLineCountForWindow = Math.max(
    transcriptHeight - (isScrolledUp ? 1 : 0),
    1,
  );
  const window = getTranscriptWindow({
    rowCount,
    visibleLineCount: visibleLineCountForWindow,
    scrollOffsetLines: effectiveScrollOffsetLines,
  });
  const scrollHint = getTranscriptScrollHint({
    isScrolledUp,
    hasUpdatesBelow,
  });

  useLayoutEffect(() => {
    const previousRowCount = previousRowCountRef.current;
    const previousTranscriptHeight = previousTranscriptHeightRef.current;
    previousRowCountRef.current = rowCount;
    previousTranscriptHeightRef.current = transcriptHeight;
    setScrollOffsetLines((current) =>
      reconcilePausedOffset({
        previousRowCount,
        nextRowCount: rowCount,
        previousVisibleLineCount: previousTranscriptHeight,
        nextVisibleLineCount: transcriptHeight,
        currentScrollOffsetLines: current,
      }),
    );
    if (scrollOffsetLines === 0 || maxScrollLines === 0) {
      pausedTranscriptVersionRef.current = null;
    }
  }, [maxScrollLines, rowCount, scrollOffsetLines, transcriptHeight]);

  const scrollStep = Math.max(1, Math.floor(transcriptHeight * 0.7));

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
