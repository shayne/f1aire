import React from 'react';
import { Box, Text, type BoxProps } from '#ink';

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
  const borderColor =
    tone === 'accent' ? 'ansi:cyan' : 'ansi:blackBright';
  const titleColor = tone === 'accent' ? 'ansi:cyan' : 'ansi:blackBright';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={paddingX}
      paddingY={paddingY}
      {...boxProps}
    >
      <Text color={titleColor}>{title}</Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  );
}
