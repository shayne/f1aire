import React, { useMemo } from 'react';
import { Box, Text } from '#ink';
import { useAnimationFrame } from '../../../vendor/ink/hooks/use-animation-frame.js';
import type { Color } from '../../../vendor/ink/styles.js';
import { theme } from '../../theme.js';
import {
  getEngineerStatusFlashOn,
  getEngineerStatusGlimmerIndex,
  getEngineerStatusGlyph,
  getEngineerStatusMode,
  splitEngineerStatusMessage,
} from './engineer-status-animation.js';

const STATUS_INTERVAL_MS = 50;

function getStatusAccent(status: string): Color {
  const normalized = status.toLowerCase();
  if (normalized.startsWith('error')) return theme.status.error;
  if (
    normalized.includes('tool') ||
    normalized.includes('python') ||
    normalized.includes('loading')
  ) {
    return theme.status.tool;
  }

  return theme.assistant;
}

function renderShimmerMessage(
  message: string,
  glimmerIndex: number,
  accentColor: Color,
  flashOn: boolean,
) {
  if (flashOn) {
    return <Text color={accentColor}>{message} </Text>;
  }

  const { before, shimmer, after } = splitEngineerStatusMessage({
    message,
    glimmerIndex,
  });

  return (
    <>
      {before ? (
        <Text color={theme.subtle} dimColor>
          {before}
        </Text>
      ) : null}
      {shimmer ? <Text color={accentColor}>{shimmer}</Text> : null}
      {after ? (
        <Text color={theme.subtle} dimColor>
          {after}
        </Text>
      ) : null}
      <Text color={theme.subtle} dimColor>
        {' '}
      </Text>
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
  const accentColor = getStatusAccent(message);
  const glyph = useMemo(
    () => (isStreaming ? getEngineerStatusGlyph(time) : '·'),
    [isStreaming, time],
  );
  const glimmerIndex = useMemo(
    () =>
      isStreaming
        ? getEngineerStatusGlimmerIndex({ mode, message, time })
        : -100,
    [isStreaming, message, mode, time],
  );
  const flashOn = useMemo(
    () => isStreaming && getEngineerStatusFlashOn({ mode, time }),
    [isStreaming, mode, time],
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
          renderShimmerMessage(message, glimmerIndex, accentColor, flashOn)
        ) : (
          <Text color={theme.subtle} dimColor>
            {message}
          </Text>
        )}
      </Box>
    </Box>
  );
}
