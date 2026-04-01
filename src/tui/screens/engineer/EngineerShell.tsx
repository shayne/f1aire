import React from 'react';
import { AlternateScreen, Box, type ScrollBoxHandle } from '#ink';
import { FullscreenLayout } from '../../../vendor/components/FullscreenLayout.js';

export function EngineerShell({
  top,
  scrollable,
  bottom,
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

  return <AlternateScreen mouseTracking>{content}</AlternateScreen>;
}
