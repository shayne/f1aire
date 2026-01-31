import React from 'react';
import { Box, Text } from 'ink';
import { formatBreadcrumb } from '../ui-utils.js';

type HeaderProps = {
  breadcrumb?: string[];
  title?: string;
};

export function Header({
  breadcrumb = [],
  title = 'F1aire - Virtual Race Engineer',
}: HeaderProps): React.JSX.Element {
  const trail = breadcrumb.length > 0 ? formatBreadcrumb(breadcrumb) : '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="green">{title}</Text>
      {trail ? <Text color="gray">{trail}</Text> : null}
    </Box>
  );
}
