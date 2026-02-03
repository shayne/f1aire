import React from 'react';
import { Text, Box } from 'ink';
import { Panel } from '../components/Panel.js';

export function RuntimePreparing({ message }: { message: string }) {
  return (
    <Panel title="Python Runtime">
      <Box flexDirection="column" gap={1}>
        <Text>{message}</Text>
        <Text>First run may download ~200MB of assets.</Text>
      </Box>
    </Panel>
  );
}
