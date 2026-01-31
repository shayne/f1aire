import React from 'react';
import { Box, Text } from 'ink';
import type { Summary as SummaryData } from '../../core/summary.js';

export function Summary({
  summary,
  dir,
}: {
  summary: SummaryData;
  dir: string;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text color="green">Download complete</Text>
      <Text>Data: {dir}</Text>
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
  );
}
