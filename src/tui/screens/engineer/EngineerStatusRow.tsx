import figures from 'figures';
import React, { useMemo } from 'react';
import { Box, Text } from '#ink';
import { useAnimationFrame } from '../../../vendor/ink/hooks/use-animation-frame.js';
import { stringWidth } from '../../../vendor/ink/stringWidth.js';
import { theme } from '../../theme.js';

const SHIMMER_INTERVAL_MS = 120;
const SHIMMER_PADDING = 10;

function getGlimmerIndex(message: string, time: number): number {
  const messageWidth = stringWidth(message);
  const cycleLength = Math.max(1, messageWidth + SHIMMER_PADDING * 2);
  const cyclePosition = Math.floor(time / SHIMMER_INTERVAL_MS) % cycleLength;

  return cyclePosition - SHIMMER_PADDING;
}

function renderShimmerMessage(message: string, glimmerIndex: number) {
  return Array.from(message).map((char, index) => {
    const isHighlighted =
      index === glimmerIndex || Math.abs(index - glimmerIndex) === 1;

    return (
      <Text
        key={`${index}-${char}`}
        color={isHighlighted ? 'ansi:white' : theme.subtle}
      >
        {char}
      </Text>
    );
  });
}

export function EngineerStatusRow({
  status,
  isStreaming,
}: {
  status: string;
  isStreaming: boolean;
}): React.JSX.Element {
  const [, time] = useAnimationFrame(isStreaming ? SHIMMER_INTERVAL_MS : null);
  const message = status.trim() || 'Idle';
  const suffix = isStreaming
    ? '.'.repeat((Math.floor(time / 300) % 3) + 1).padEnd(3)
    : '';
  const glimmerIndex = useMemo(
    () => (isStreaming ? getGlimmerIndex(message, time) : -100),
    [isStreaming, message, time],
  );

  return (
    <Box flexDirection="column" width="100%" height={2}>
      <Box height={1} />
      <Box flexDirection="row" width="100%" paddingLeft={2}>
        <Text color={theme.subtle}>{figures.pointerSmall} </Text>
        {isStreaming ? (
          <>
            {renderShimmerMessage(message, glimmerIndex)}
            <Text color={theme.subtle}>{suffix}</Text>
          </>
        ) : (
          <Text color={theme.subtle}>{message}</Text>
        )}
      </Box>
    </Box>
  );
}
