import React from 'react';
import { Box, Text } from '#ink';
import { theme } from '../theme.js';

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
  const [brand, tagline] = title.split(' - ');

  return (
    <Box flexDirection="column" marginBottom={compact ? 0 : 1}>
      {compact && tagline ? (
        <Text wrap="truncate-end">
          <Text color={theme.brand} bold>
            {brand}
          </Text>
          <Text color={theme.subtle} dimColor>{` · ${tagline}`}</Text>
        </Text>
      ) : (
        <>
          <Text color={theme.brand} bold>
            {brand}
          </Text>
          {tagline ? <Text color={theme.subtle} dimColor>{tagline}</Text> : null}
        </>
      )}
      {breadcrumb.length > 0 && (
        <Text color={theme.subtle} dimColor wrap="truncate-end">
          {breadcrumb.join(' / ')}
        </Text>
      )}
    </Box>
  );
}
