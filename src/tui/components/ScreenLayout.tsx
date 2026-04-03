import React from 'react';
import { Box, Text, useTerminalSize } from '#ink';
import { useTheme } from '../theme/provider.js';

type ScreenLayoutProps = {
  columns?: number;
  title: string;
  subtitle?: string;
  description?: string;
  primary?: React.ReactNode;
  main?: React.ReactNode;
  details?: React.ReactNode;
  detail?: React.ReactNode;
  detailWidth?: number;
  footer?: React.ReactNode;
  splitAt?: number;
};

export function ScreenLayout({
  columns,
  title,
  subtitle,
  description,
  primary,
  main,
  details,
  detail,
  footer,
  detailWidth = 36,
  splitAt = 88,
}: ScreenLayoutProps): React.JSX.Element {
  const theme = useTheme();
  const { columns: terminalColumns = 100 } = useTerminalSize();
  const width = columns ?? terminalColumns;
  const subtitleText = subtitle ?? description;
  const primaryContent = primary ?? main;
  const detailsContent = details ?? detail;
  const stacked = !detailsContent || width < splitAt;
  const compactHeading = width < 72;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.brand} bold wrap="truncate-end">
          {title}
        </Text>
        {subtitleText ? (
          <Text color={theme.text.muted} dimColor wrap="truncate-end">
            {compactHeading ? subtitleText : `· ${subtitleText}`}
          </Text>
        ) : null}
      </Box>

      <Box flexDirection="column">
        {stacked ? (
          <Box flexDirection="column">
            <Box flexDirection="column">{primaryContent}</Box>
            {detailsContent ? (
              <Box flexDirection="column" marginTop={1}>
                {detailsContent}
              </Box>
            ) : null}
          </Box>
        ) : (
          <Box flexDirection="row" gap={2}>
            <Box flexDirection="column" flexGrow={1}>
              {primaryContent}
            </Box>
            <Box flexDirection="column" width={detailWidth} flexShrink={0}>
              {detailsContent}
            </Box>
          </Box>
        )}
      </Box>

      {footer ? (
        <Box flexDirection="column" marginTop={1}>
          {footer}
        </Box>
      ) : null}
    </Box>
  );
}
