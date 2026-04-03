import { useEffect, useRef, useState, type RefObject } from 'react';
import { type ScrollBoxHandle } from '#ink';
import { useUnseenDivider } from '../../../vendor/components/FullscreenLayout.js';

export function useEngineerScrollState({
  estimatedViewportRows,
  messageCount,
  rowCount,
  transcriptVersion,
}: {
  estimatedViewportRows: number;
  messageCount: number;
  rowCount: number;
  transcriptVersion: string;
}): {
  scrollRef: RefObject<ScrollBoxHandle | null>;
  dividerYRef: RefObject<number | null>;
  scrollOffset: number;
  viewportRows: number;
  scrollHint: string | null;
  newMessageCount: number;
  jumpToLatest: () => void;
  handlePageUp: () => boolean;
  handlePageDown: () => boolean;
  handleWheelUp: () => boolean;
  handleWheelDown: () => boolean;
} {
  const scrollRef = useRef<ScrollBoxHandle | null>(null);
  const { dividerIndex, dividerYRef, onScrollAway, onRepin, jumpToNew } =
    useUnseenDivider(messageCount);
  const pausedTranscriptVersionRef = useRef<string | null>(null);
  const pausedMessageCountRef = useRef(0);
  const isScrolledUpRef = useRef(false);
  const pausedScrollOffsetRef = useRef(rowCount);
  const estimatedViewportRowsRef = useRef(estimatedViewportRows);
  const rowCountRef = useRef(rowCount);
  const [pausedScrollOffset, setPausedScrollOffset] = useState(() => rowCount);
  const [measuredViewportRows, setMeasuredViewportRows] = useState(
    () => estimatedViewportRows,
  );
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const viewportRows = isScrolledUp
    ? measuredViewportRows
    : measuredViewportRows;
  const scrollOffset = isScrolledUp
    ? Math.min(pausedScrollOffset, Math.max(0, rowCount - viewportRows))
    : Math.max(0, rowCount - viewportRows);

  useEffect(() => {
    if (dividerIndex === null) {
      pausedTranscriptVersionRef.current = null;
      pausedMessageCountRef.current = 0;
      isScrolledUpRef.current = false;
      setIsScrolledUp(false);
    }
  }, [dividerIndex]);

  useEffect(() => {
    pausedScrollOffsetRef.current = Math.min(
      pausedScrollOffsetRef.current,
      Math.max(0, rowCount - measuredViewportRows),
    );
  }, [measuredViewportRows, rowCount]);

  useEffect(() => {
    const handle = scrollRef.current;
    const hasViewportEstimateChanged =
      estimatedViewportRowsRef.current !== estimatedViewportRows;
    const hasRowCountChanged = rowCountRef.current !== rowCount;

    estimatedViewportRowsRef.current = estimatedViewportRows;
    rowCountRef.current = rowCount;

    if (!hasViewportEstimateChanged && !hasRowCountChanged) return;
    if (!handle || isScrolledUpRef.current) return;

    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    pausedScrollOffsetRef.current = Math.max(0, rowCount - nextViewportRows);
    jumpToNew(handle);
  }, [estimatedViewportRows, jumpToNew, rowCount]);

  const setPausedOffset = (nextOffset: number) => {
    pausedScrollOffsetRef.current = nextOffset;
    setPausedScrollOffset(nextOffset);
  };

  const pauseScrollback = (currentMaxOffset: number) => {
    if (isScrolledUpRef.current) return;
    pausedTranscriptVersionRef.current = transcriptVersion;
    pausedMessageCountRef.current = messageCount;
    pausedScrollOffsetRef.current = currentMaxOffset;
    isScrolledUpRef.current = true;
    setIsScrolledUp(true);
  };

  const repinScrollback = () => {
    pausedTranscriptVersionRef.current = null;
    pausedMessageCountRef.current = 0;
    isScrolledUpRef.current = false;
    setIsScrolledUp(false);
    onRepin();
  };

  const handlePageUp = () => {
    const handle = scrollRef.current;
    if (!handle) return false;

    const wasScrolledUp = isScrolledUpRef.current;
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    const pageStep = Math.max(1, Math.floor(nextViewportRows * 0.7));
    const maxOffset = Math.max(0, rowCount - nextViewportRows);
    pauseScrollback(maxOffset);
    const nextOffset = Math.max(
      0,
      Math.min(pausedScrollOffsetRef.current, maxOffset) - pageStep,
    );
    setPausedOffset(nextOffset);

    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    if (wasScrolledUp) {
      handle.scrollTo(nextOffset);
    } else {
      handle.scrollBy(nextOffset - maxOffset);
    }
    onScrollAway(handle);
    return true;
  };

  const handleWheelUp = () => {
    const handle = scrollRef.current;
    if (!handle) return false;

    const wasScrolledUp = isScrolledUpRef.current;
    const lineStep = Math.max(1, Math.floor(handle.getViewportHeight() * 0.2));
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    const maxOffset = Math.max(0, rowCount - nextViewportRows);

    pauseScrollback(maxOffset);
    const nextOffset = Math.max(
      0,
      Math.min(pausedScrollOffsetRef.current, maxOffset) - lineStep,
    );
    setPausedOffset(nextOffset);

    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    if (wasScrolledUp) {
      handle.scrollTo(nextOffset);
    } else {
      handle.scrollBy(nextOffset - maxOffset);
    }
    onScrollAway(handle);
    return true;
  };

  const handleWheelDown = () => {
    const handle = scrollRef.current;
    if (!isScrolledUpRef.current || !handle) {
      if (!handle) {
        repinScrollback();
      }
      return false;
    }

    const lineStep = Math.max(1, Math.floor(handle.getViewportHeight() * 0.2));
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    const max = Math.max(0, rowCount - nextViewportRows);
    const nextOffset = Math.min(
      max,
      Math.min(pausedScrollOffsetRef.current, max) + lineStep,
    );

    if (nextOffset >= max) {
      jumpToNew(handle);
      setMeasuredViewportRows((current) =>
        current === nextViewportRows ? current : nextViewportRows,
      );
      setPausedOffset(max);
      repinScrollback();
      return true;
    }

    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    setPausedOffset(nextOffset);
    handle.scrollTo(nextOffset);
    return true;
  };

  const handlePageDown = () => {
    const handle = scrollRef.current;
    if (!isScrolledUpRef.current || !handle) {
      if (!handle) {
        repinScrollback();
      }
      return false;
    }

    jumpToNew(handle);
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    setPausedOffset(Math.max(0, rowCount - nextViewportRows));
    repinScrollback();
    return true;
  };

  const jumpToLatest = () => {
    const handle = scrollRef.current;
    if (!handle) {
      repinScrollback();
      return;
    }

    jumpToNew(handle);
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    setPausedOffset(Math.max(0, rowCount - nextViewportRows));
    repinScrollback();
  };

  const hasUpdatesBelow =
    pausedTranscriptVersionRef.current !== null &&
    pausedTranscriptVersionRef.current !== transcriptVersion;
  const scrollHint = isScrolledUp
    ? hasUpdatesBelow
      ? 'New updates below · pgdn to catch up'
      : 'Viewing earlier output · pgdn to return live'
    : null;
  const newMessageCount =
    isScrolledUp && hasUpdatesBelow
      ? Math.max(messageCount - pausedMessageCountRef.current, 1)
      : 0;

  return {
    scrollRef,
    dividerYRef,
    scrollOffset,
    viewportRows,
    scrollHint,
    newMessageCount,
    jumpToLatest,
    handlePageUp,
    handlePageDown,
    handleWheelUp,
    handleWheelDown,
  };
}
