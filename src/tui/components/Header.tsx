import React from 'react';
import { Box, Text } from '#ink';
import { useTheme } from '../theme/provider.js';

type HeaderProps = {
  breadcrumb?: string[];
  title?: string;
  compact?: boolean;
};

export function Header({
  breadcrumb = [],
  title = 'f1aire - Virtual Race Engineer',
  compact = false,
}: HeaderProps): React.JSX.Element {
  const theme = useTheme();
  const [brand, tagline] = title.split(' - ');

  return (
    <Box flexDirection="column" marginBottom={compact ? 0 : 1}>
      {compact && tagline ? (
        <Text wrap="truncate-end">
          <Text color={theme.text.brand} bold>
            {brand}
          </Text>
          <Text color={theme.text.muted} dimColor>{` · ${tagline}`}</Text>
        </Text>
      ) : (
        <>
          <Text color={theme.text.brand} bold>
            {brand}
          </Text>
          {tagline ? (
            <Text color={theme.text.muted} dimColor>
              {tagline}
            </Text>
          ) : null}
        </>
      )}
      {breadcrumb.length > 0 && (
        <Text color={theme.text.muted} dimColor wrap="truncate-end">
          {breadcrumb.join(' / ')}
        </Text>
      )}
    </Box>
  );
}
