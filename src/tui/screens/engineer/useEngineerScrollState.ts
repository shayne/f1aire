import { useRef, useState, type RefObject } from 'react';
import { type ScrollBoxHandle, useInput } from '#ink';

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
} {
  const scrollRef = useRef<ScrollBoxHandle | null>(null);
  const dividerYRef = useRef<number | null>(null);
  const pausedTranscriptVersionRef = useRef<string | null>(null);
  const pausedMessageCountRef = useRef(0);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  useInput((_, key) => {
    const handle = scrollRef.current;
    const pageStep = Math.max(
      1,
      Math.floor((handle?.getViewportHeight() ?? 0) * 0.7),
    );

    if (key.pageUp) {
      if (!isScrolledUp) {
        pausedTranscriptVersionRef.current = transcriptVersion;
        pausedMessageCountRef.current = messageCount;
      }
      setIsScrolledUp(true);
      handle?.scrollBy(-pageStep);
      return;
    }

    if (key.pageDown) {
      if (!handle) {
        pausedTranscriptVersionRef.current = null;
        pausedMessageCountRef.current = 0;
        setIsScrolledUp(false);
        return;
      }

      const maxScrollTop = Math.max(
        handle.getFreshScrollHeight() - handle.getViewportHeight(),
        0,
      );
      const nextScrollTop = Math.min(
        handle.getScrollTop() + handle.getPendingDelta() + pageStep,
        maxScrollTop,
      );

      if (nextScrollTop >= maxScrollTop) {
        handle.scrollToBottom();
        pausedTranscriptVersionRef.current = null;
        pausedMessageCountRef.current = 0;
        setIsScrolledUp(false);
        return;
      }

      handle.scrollBy(pageStep);
    }
  });

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

  const jumpToLatest = () => {
    scrollRef.current?.scrollToBottom();
    pausedTranscriptVersionRef.current = null;
    pausedMessageCountRef.current = 0;
    setIsScrolledUp(false);
  };

  return {
    scrollRef,
    dividerYRef,
    scrollHint,
    newMessageCount,
    jumpToLatest,
  };
}
