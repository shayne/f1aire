import React from 'react';
import { Text } from '#ink';
import type { Color } from '../../../vendor/ink/styles.js';
import { splitEngineerStatusMessage } from './engineer-status-animation.js';

export function EngineerShimmerMessage({
  message,
  glimmerIndex,
  messageColor,
  shimmerColor,
}: {
  message: string;
  glimmerIndex: number;
  messageColor: Color;
  shimmerColor: Color;
}): React.ReactNode {
  if (!message) {
    return null;
  }

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
