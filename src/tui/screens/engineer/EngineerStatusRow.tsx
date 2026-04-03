import React, { useMemo } from 'react';
import { Box, Text } from '#ink';
import type { Color } from '../../../vendor/ink/styles.js';
import { theme } from '../../theme.js';
import { getEngineerStatusMode } from './engineer-status-animation.js';
import { EngineerStatusGlyph } from './EngineerStatusGlyph.js';
import { EngineerShimmerMessage } from './EngineerShimmerMessage.js';
import { useEngineerShimmerAnimation } from './useEngineerShimmerAnimation.js';

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

export function EngineerStatusRow({
  status,
  isStreaming,
}: {
  status: string;
  isStreaming: boolean;
}): React.JSX.Element {
  const message = status.trim() || 'Idle';
  const mode = useMemo(() => getEngineerStatusMode(message), [message]);
  const [animationRef, glimmerIndex, time] = useEngineerShimmerAnimation(
    mode,
    message,
    !isStreaming,
  );
  const { accentColor, shimmerColor } = getStatusColors(message);

  if (!isStreaming && message === 'Idle') {
    return <Box />;
  }

  return (
    <Box flexDirection="column" width="100%" height={2}>
      <Box height={1} />
      <Box
        ref={animationRef}
        flexDirection="row"
        width="100%"
        paddingLeft={2}
      >
        <EngineerStatusGlyph
          time={time}
          color={accentColor}
          isIdle={!isStreaming}
        />
        {isStreaming ? (
          <EngineerShimmerMessage
            message={message}
            glimmerIndex={glimmerIndex}
            messageColor={accentColor}
            shimmerColor={shimmerColor}
          />
        ) : (
          <Text color={theme.subtle} dimColor>
            {message}
          </Text>
        )}
      </Box>
    </Box>
  );
}
