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
  const [pausedScrollOffset, setPausedScrollOffset] = useState(() => rowCount);
  const [measuredViewportRows, setMeasuredViewportRows] = useState(
    () => estimatedViewportRows,
  );
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const viewportRows = isScrolledUp
    ? measuredViewportRows
    : estimatedViewportRows;
  const scrollOffset = isScrolledUp
    ? Math.min(pausedScrollOffset, Math.max(0, rowCount - viewportRows))
    : Math.max(0, rowCount - viewportRows);

  useEffect(() => {
    if (dividerIndex === null) {
      pausedTranscriptVersionRef.current = null;
      pausedMessageCountRef.current = 0;
      setIsScrolledUp(false);
    }
  }, [dividerIndex]);

  const handlePageUp = () => {
    const handle = scrollRef.current;
    if (!handle) return false;

    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    const pageStep = Math.max(1, Math.floor(nextViewportRows * 0.7));
    const maxOffset = Math.max(0, rowCount - nextViewportRows);

    if (!isScrolledUp) {
      pausedTranscriptVersionRef.current = transcriptVersion;
      pausedMessageCountRef.current = messageCount;
      setPausedScrollOffset(Math.max(0, maxOffset - pageStep));
    } else {
      setPausedScrollOffset((current) =>
        Math.max(0, Math.min(current, maxOffset) - pageStep),
      );
    }

    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    setIsScrolledUp(true);
    handle.scrollBy(-pageStep);
    onScrollAway(handle);
    return true;
  };

  const handleWheelUp = () => {
    const handle = scrollRef.current;
    if (!handle) return false;

    const lineStep = Math.max(1, Math.floor(handle.getViewportHeight() * 0.2));
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    const maxOffset = Math.max(0, rowCount - nextViewportRows);

    if (!isScrolledUp) {
      pausedTranscriptVersionRef.current = transcriptVersion;
      pausedMessageCountRef.current = messageCount;
      setPausedScrollOffset(Math.max(0, maxOffset - lineStep));
    } else {
      setPausedScrollOffset((current) =>
        Math.max(0, Math.min(current, maxOffset) - lineStep),
      );
    }

    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    setIsScrolledUp(true);
    handle.scrollBy(-lineStep);
    onScrollAway(handle);
    return true;
  };

  const handleWheelDown = () => {
    const handle = scrollRef.current;
    if (!isScrolledUp || !handle) {
      if (!handle) {
        pausedTranscriptVersionRef.current = null;
        pausedMessageCountRef.current = 0;
        setIsScrolledUp(false);
        onRepin();
      }
      return false;
    }

    const lineStep = Math.max(1, Math.floor(handle.getViewportHeight() * 0.2));
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    const max = Math.max(0, rowCount - nextViewportRows);
    const nextOffset = Math.min(max, scrollOffset + lineStep);

    if (nextOffset >= max) {
      jumpToNew(handle);
      pausedTranscriptVersionRef.current = null;
      pausedMessageCountRef.current = 0;
      setMeasuredViewportRows((current) =>
        current === nextViewportRows ? current : nextViewportRows,
      );
      setPausedScrollOffset(max);
      setIsScrolledUp(false);
      onRepin();
      return true;
    }

    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    setPausedScrollOffset(nextOffset);
    handle.scrollBy(lineStep);
    return true;
  };

  const handlePageDown = () => {
    const handle = scrollRef.current;
    if (!isScrolledUp || !handle) {
      if (!handle) {
        pausedTranscriptVersionRef.current = null;
        pausedMessageCountRef.current = 0;
        setIsScrolledUp(false);
        onRepin();
      }
      return false;
    }

    jumpToNew(handle);
    pausedTranscriptVersionRef.current = null;
    pausedMessageCountRef.current = 0;
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    setPausedScrollOffset(Math.max(0, rowCount - nextViewportRows));
    setIsScrolledUp(false);
    onRepin();
    return true;
  };

  const jumpToLatest = () => {
    const handle = scrollRef.current;
    if (!handle) {
      pausedTranscriptVersionRef.current = null;
      pausedMessageCountRef.current = 0;
      setIsScrolledUp(false);
      onRepin();
      return;
    }

    jumpToNew(handle);
    pausedTranscriptVersionRef.current = null;
    pausedMessageCountRef.current = 0;
    const nextViewportRows = Math.max(0, handle.getViewportHeight());
    setMeasuredViewportRows((current) =>
      current === nextViewportRows ? current : nextViewportRows,
    );
    setPausedScrollOffset(Math.max(0, rowCount - nextViewportRows));
    setIsScrolledUp(false);
    onRepin();
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
