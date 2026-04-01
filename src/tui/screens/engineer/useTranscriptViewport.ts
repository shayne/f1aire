import { useInput } from 'ink';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

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
  panelHeight,
  panelOverhead,
  transcriptVersion,
}: {
  rowCount: number;
  panelHeight: number;
  panelOverhead: number;
  transcriptVersion: number;
}): {
  scrollOffsetLines: number;
  effectiveScrollOffsetLines: number;
  scrollHint: string | null;
  visibleWindow: { start: number; end: number };
  visibleLineCount: number;
} {
  const [scrollOffsetLines, setScrollOffsetLines] = useState(0);
  const previousRowCountRef = useRef(0);
  const pausedTranscriptVersionRef = useRef<number | null>(null);
  const scrollHintLines = scrollOffsetLines > 0 ? 1 : 0;
  const visibleLineCount = Math.max(
    panelHeight - panelOverhead - scrollHintLines,
    1,
  );
  const maxScrollLines = Math.max(rowCount - visibleLineCount, 0);
  const effectiveScrollOffsetLines = Math.min(
    scrollOffsetLines,
    maxScrollLines,
  );
  const isScrolledUp = effectiveScrollOffsetLines > 0;

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

  const hasUpdatesBelow = useMemo(() => {
    return (
      isScrolledUp &&
      pausedTranscriptVersionRef.current !== null &&
      transcriptVersion > pausedTranscriptVersionRef.current
    );
  }, [isScrolledUp, transcriptVersion]);

  const scrollHint = getTranscriptScrollHint({
    isScrolledUp,
    hasUpdatesBelow,
  });

  return {
    scrollOffsetLines,
    effectiveScrollOffsetLines,
    scrollHint,
    visibleWindow: getTranscriptWindow({
      rowCount,
      visibleLineCount,
      scrollOffsetLines: effectiveScrollOffsetLines,
    }),
    visibleLineCount,
  };
}
