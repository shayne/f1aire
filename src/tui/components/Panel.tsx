import React from 'react';
import { Box, Text } from 'ink';

type PanelProps = {
  title: string;
  children: React.ReactNode;
};

export function Panel({ title, children }: PanelProps): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text color="gray">{title}</Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  );
}
