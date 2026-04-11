import React, { useEffect, useRef } from 'react';
import {
  AlternateScreen,
  Box,
  type Key,
  type ScrollBoxHandle,
  useInput,
  useSelection,
} from '#ink';
import { FullscreenLayout } from '../../../vendor/components/FullscreenLayout.js';

function isAlwaysHandledCopyShortcut(input: string, key: Key): boolean {
  return (
    input === 'c' &&
    ((key.super && !key.ctrl && !key.meta) ||
      (key.ctrl && key.shift && !key.meta && !key.super))
  );
}

function shouldClearSelection(input: string, key: Key): boolean {
  return (
    input.length > 0 ||
    key.upArrow ||
    key.downArrow ||
    key.leftArrow ||
    key.rightArrow ||
    key.pageDown ||
    key.pageUp ||
    key.wheelUp ||
    key.wheelDown ||
    key.home ||
    key.end ||
    key.return ||
    key.tab ||
    key.backspace ||
    key.delete
  );
}

function EngineerSelectionClipboard(): null {
  const selection = useSelection();
  const copiedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = selection.subscribe(() => {
      const state = selection.getState();

      if (state?.isDragging) {
        copiedRef.current = false;
        return;
      }

      if (!selection.hasSelection()) {
        copiedRef.current = false;
        return;
      }

      if (copiedRef.current) return;

      copiedRef.current = true;
      selection.copySelectionNoClear();
    });

    return unsubscribe;
  }, [selection]);

  useInput((input, key, event) => {
    const hasSelection = selection.hasSelection();

    if (key.escape) {
      if (!hasSelection) return;
      selection.clearSelection();
      event.stopImmediatePropagation();
      return;
    }

    if (isAlwaysHandledCopyShortcut(input, key)) {
      if (hasSelection) {
        selection.copySelection();
      }
      event.stopImmediatePropagation();
      return;
    }

    if (
      input === 'c' &&
      key.ctrl &&
      !key.shift &&
      !key.meta &&
      !key.super &&
      hasSelection
    ) {
      selection.copySelection();
      event.stopImmediatePropagation();
      return;
    }

    if (hasSelection && shouldClearSelection(input, key)) {
      selection.clearSelection();
    }
  });

  return null;
}

export function EngineerShell({
  top,
  scrollable,
  bottom,
  modal,
  scrollRef,
  dividerYRef,
  newMessageCount,
  onPillClick,
  height,
  fullscreen = true,
}: {
  top?: React.ReactNode;
  scrollable: React.ReactNode;
  bottom: React.ReactNode;
  modal?: React.ReactNode;
  scrollRef?: React.RefObject<ScrollBoxHandle | null>;
  dividerYRef?: React.RefObject<number | null>;
  newMessageCount?: number;
  onPillClick?: () => void;
  height?: number | string;
  fullscreen?: boolean;
}) {
  const content = (
    <Box flexDirection="column" height={height ?? '100%'}>
      <FullscreenLayout
        top={top}
        scrollable={scrollable}
        bottom={bottom}
        modal={modal}
        scrollRef={scrollRef}
        dividerYRef={dividerYRef}
        newMessageCount={newMessageCount}
        onPillClick={onPillClick}
      />
    </Box>
  );

  if (!fullscreen) {
    return content;
  }

  return (
    <AlternateScreen mouseTracking>
      <EngineerSelectionClipboard />
      {content}
    </AlternateScreen>
  );
}
