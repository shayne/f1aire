import React from 'react';
import { Box, Text } from 'ink';
import type { Summary as SummaryData } from '../../core/summary.js';
import { Panel } from '../components/Panel.js';
import { theme } from '../theme.js';

export function Summary({
  summary,
  dir,
}: {
  summary: SummaryData;
  dir: string;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      <Text color={theme.brand}>Download complete</Text>
      <Panel title="Session summary" tone="accent">
        <Text color={theme.muted}>Data path</Text>
        <Text>{dir}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>
            Winner: {summary.winner ? summary.winner.name : 'Unknown'}
          </Text>
          <Text>
            Fastest lap:{' '}
            {summary.fastestLap
              ? `${summary.fastestLap.name} (${summary.fastestLap.time})`
              : 'Unknown'}
          </Text>
          <Text>Total laps: {summary.totalLaps ?? 'Unknown'}</Text>
        </Box>
      </Panel>
    </Box>
  );
}
