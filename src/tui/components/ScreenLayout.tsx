import React from 'react';
import { Box, Text, useTerminalSize } from '#ink';
import { useTheme } from '../theme/provider.js';

type ScreenLayoutProps = {
  title: string;
  description?: string;
  main: React.ReactNode;
  detail?: React.ReactNode;
  detailWidth?: number;
  splitAt?: number;
};

export function ScreenLayout({
  title,
  description,
  main,
  detail,
  detailWidth = 36,
  splitAt = 84,
}: ScreenLayoutProps): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
  const stacked = !detail || columns < splitAt;

  return (
    <Box flexDirection="column">
      <Text>{title}</Text>
      {description ? (
        <Text color={theme.text.muted} dimColor>
          {description}
        </Text>
      ) : null}
      <Box flexDirection="column" marginTop={1}>
        {stacked ? (
          <Box flexDirection="column">
            <Box flexDirection="column">{main}</Box>
            {detail ? (
              <Box flexDirection="column" marginTop={1}>
                {detail}
              </Box>
            ) : null}
          </Box>
        ) : (
          <Box flexDirection="row" gap={2}>
            <Box flexDirection="column" flexGrow={1}>
              {main}
            </Box>
            <Box flexDirection="column" width={detailWidth} flexShrink={0}>
              {detail}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
