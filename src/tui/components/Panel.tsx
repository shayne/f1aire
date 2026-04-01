import React from 'react';
import { Box, Text, type BoxProps } from '#ink';
import { theme } from '../theme.js';

type PanelProps = {
  title: string;
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'muted';
  paddingX?: number;
  paddingY?: number;
  boxProps?: BoxProps;
};

export function Panel({
  title,
  children,
  tone = 'neutral',
  paddingX = 1,
  paddingY = 0,
  boxProps,
}: PanelProps): React.JSX.Element {
  const titleColor = tone === 'accent' ? theme.accent : theme.panelTitle;

  return (
    <Box
      flexDirection="column"
      paddingX={paddingX}
      paddingY={paddingY}
      {...boxProps}
    >
      <Text color={titleColor}>{title}</Text>
      <Box flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
