import React from 'react';
import { Text } from '#ink';
import type { Color } from '../../../vendor/ink/styles.js';
import { useTheme } from '../../theme/provider.js';
import type { F1aireTheme } from '../../theme/tokens.js';
import {
  splitEngineerStatusMessage,
  type EngineerStatusMode,
} from './engineer-status-animation.js';

function getShimmerColors({
  mode,
  message,
  theme,
}: {
  mode: EngineerStatusMode;
  message: string;
  theme: F1aireTheme;
}): { messageColor: Color; shimmerColor: Color } {
  if (message.toLowerCase().startsWith('error')) {
    return {
      messageColor: theme.status.error,
      shimmerColor: theme.status.errorShimmer,
    };
  }

  if (mode === 'requesting' || mode === 'tool-use') {
    return {
      messageColor: theme.status.tool,
      shimmerColor: theme.status.toolShimmer,
    };
  }

  return {
    messageColor: theme.status.thinking,
    shimmerColor: theme.status.thinkingShimmer,
  };
}

export function EngineerShimmerMessage({
  message,
  glimmerIndex,
  mode,
}: {
  message: string;
  glimmerIndex: number;
  mode: EngineerStatusMode;
}): React.ReactNode {
  const theme = useTheme();

  if (!message) {
    return null;
  }

  const { messageColor, shimmerColor } = getShimmerColors({
    mode,
    message,
    theme,
  });

  const { before, shimmer, after } = splitEngineerStatusMessage({
    message,
    glimmerIndex,
  });

  return (
    <>
      {before ? <Text color={messageColor}>{before}</Text> : null}
      <Text color={shimmerColor}>{shimmer}</Text>
      {after ? <Text color={messageColor}>{after}</Text> : null}
      <Text color={messageColor}> </Text>
    </>
  );
}
