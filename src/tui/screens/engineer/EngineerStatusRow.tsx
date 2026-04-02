import React, { useMemo } from 'react';
import { Box, Text } from '#ink';
import { useAnimationFrame } from '../../../vendor/ink/hooks/use-animation-frame.js';
import type { Color } from '../../../vendor/ink/styles.js';
import { theme } from '../../theme.js';
import {
  F1AIRE_STATUS_FRAMES,
  getEngineerStatusGlimmerIndex,
  getEngineerStatusGlyph,
  getEngineerStatusMode,
  splitEngineerStatusMessage,
} from './engineer-status-animation.js';

const STATUS_INTERVAL_MS = 50;

function getStatusColors(status: string): {
  accentColor: Color;
  shimmerColor: Color;
} {
  const normalized = status.toLowerCase();
  if (normalized.startsWith('error')) {
    return {
      accentColor: theme.status.error,
      shimmerColor: theme.status.errorShimmer,
    };
  }

  if (
    normalized.includes('tool') ||
    normalized.includes('python') ||
    normalized.includes('loading')
  ) {
    return {
      accentColor: theme.status.tool,
      shimmerColor: theme.status.toolShimmer,
    };
  }

  return {
    accentColor: theme.status.thinking,
    shimmerColor: theme.status.thinkingShimmer,
  };
}

function renderShimmerMessage(
  message: string,
  glimmerIndex: number,
  accentColor: Color,
  shimmerColor: Color,
) {
  const { before, shimmer, after } = splitEngineerStatusMessage({
    message,
    glimmerIndex,
  });

  return (
    <>
      {before ? (
        <Text color={accentColor}>
          {before}
        </Text>
      ) : null}
      {shimmer ? <Text color={shimmerColor}>{shimmer}</Text> : null}
      {after ? (
        <Text color={accentColor}>
          {after}
        </Text>
      ) : null}
      <Text color={accentColor}> </Text>
    </>
  );
}

export function EngineerStatusRow({
  status,
  isStreaming,
}: {
  status: string;
  isStreaming: boolean;
}): React.JSX.Element {
  const [animationRef, time] = useAnimationFrame(
    isStreaming ? STATUS_INTERVAL_MS : null,
  );
  const message = status.trim() || 'Idle';
  const mode = useMemo(() => getEngineerStatusMode(message), [message]);
  const { accentColor, shimmerColor } = getStatusColors(message);
  const glyph = useMemo(
    () =>
      isStreaming
        ? getEngineerStatusGlyph(time)
        : (F1AIRE_STATUS_FRAMES[0] ?? '⠋'),
    [isStreaming, time],
  );
  const glimmerIndex = useMemo(
    () =>
      isStreaming
        ? getEngineerStatusGlimmerIndex({ mode, message, time })
        : -100,
    [isStreaming, message, mode, time],
  );

  return (
    <Box flexDirection="column" width="100%" height={2}>
      <Box height={1} />
      <Box
        ref={animationRef}
        flexDirection="row"
        width="100%"
        paddingLeft={2}
      >
        <Box width={2}>
          <Text color={accentColor}>{glyph}</Text>
        </Box>
        {isStreaming ? (
          renderShimmerMessage(
            message,
            glimmerIndex,
            accentColor,
            shimmerColor,
          )
        ) : (
          <Text color={theme.subtle} dimColor>
            {message}
          </Text>
        )}
      </Box>
    </Box>
  );
}
