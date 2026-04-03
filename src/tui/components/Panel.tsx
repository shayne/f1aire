import React from 'react';
import { Box, Text, type BoxProps } from '#ink';
import { useTheme } from '../theme/provider.js';

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
  const theme = useTheme();
  const titleColor =
    tone === 'accent' ? theme.chrome.selected : theme.chrome.panelTitle;
  const titleIsMuted = tone !== 'accent';

  return (
    <Box
      flexDirection="column"
      paddingX={paddingX}
      paddingY={paddingY}
      {...boxProps}
    >
      <Text color={titleColor} dimColor={titleIsMuted}>
        {title}
      </Text>
      <Box flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
