import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

type HeaderProps = {
  breadcrumb?: string[];
  title?: string;
};

export function Header({
  breadcrumb = [],
  title = 'F1aire - Virtual Race Engineer',
}: HeaderProps): React.JSX.Element {
  const [brand, tagline] = title.split(' - ');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
        <Box flexGrow={1} gap={1}>
          <Text color={theme.brand} bold>
            {brand}
          </Text>
          {tagline ? <Text color={theme.muted}>{tagline}</Text> : null}
        </Box>
      </Box>
      {breadcrumb.length > 0 && (
        <Box marginTop={1} flexWrap="wrap">
          {breadcrumb.map((part, index) => (
            <Text
              key={`${part}-${index}`}
              color={index === breadcrumb.length - 1 ? theme.accent : theme.muted}
            >
              {part}
              {index < breadcrumb.length - 1 ? ' / ' : ''}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
