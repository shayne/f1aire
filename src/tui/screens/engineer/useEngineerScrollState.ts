import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { type ScrollBoxHandle } from '#ink';
import { useUnseenDivider } from '../../../vendor/components/FullscreenLayout.js';

export function useEngineerScrollState({
  messageCount,
  transcriptVersion,
}: {
  messageCount: number;
  transcriptVersion: string;
}): {
  scrollRef: RefObject<ScrollBoxHandle | null>;
  dividerYRef: RefObject<number | null>;
  scrollHint: string | null;
  newMessageCount: number;
  jumpToLatest: () => void;
  handlePageUp: () => boolean;
  handlePageDown: () => boolean;
} {
  const scrollRef = useRef<ScrollBoxHandle | null>(null);
  const { dividerIndex, dividerYRef, onScrollAway, onRepin, jumpToNew } =
    useUnseenDivider(messageCount);
  const pausedTranscriptVersionRef = useRef<string | null>(null);
  const pausedMessageCountRef = useRef(0);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

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

    const pageStep = Math.max(1, Math.floor(handle.getViewportHeight() * 0.7));

    if (!isScrolledUp) {
      pausedTranscriptVersionRef.current = transcriptVersion;
      pausedMessageCountRef.current = messageCount;
    }

    setIsScrolledUp(true);
    handle.scrollBy(-pageStep);
    onScrollAway(handle);
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
    scrollHint,
    newMessageCount,
    jumpToLatest,
    handlePageUp,
    handlePageDown,
  };
}
