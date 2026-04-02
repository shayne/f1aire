import React, { useMemo } from 'react';
import { Box, Text } from '#ink';
import type { Color } from '../../../vendor/ink/styles.js';
import {
  F1AIRE_STATUS_FRAMES,
  getEngineerStatusGlyph,
} from './engineer-status-animation.js';

export function EngineerStatusGlyph({
  time,
  color,
  isIdle = false,
}: {
  time: number;
  color: Color;
  isIdle?: boolean;
}): React.JSX.Element {
  const glyph = useMemo(
    () =>
      isIdle
        ? (F1AIRE_STATUS_FRAMES[0] ?? '⠋')
        : getEngineerStatusGlyph(time),
    [isIdle, time],
  );

  return (
    <Box width={2}>
      <Text color={color}>{glyph}</Text>
    </Box>
  );
}
