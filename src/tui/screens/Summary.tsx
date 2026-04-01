import React from 'react';
import { Box, Text } from '#ink';
import type { Summary as SummaryData } from '../../core/summary.js';
import { Panel } from '../components/Panel.js';
import { createTerminalLink } from '../terminal-chrome.js';
import { theme } from '../theme.js';

export function Summary({
  summary,
  dir,
}: {
  summary: SummaryData;
  dir: string;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text color={theme.brand}>Session ready</Text>
      <Text color={theme.subtle}>
        The race engineer can use this downloaded session immediately.
      </Text>
      <Box marginTop={1}>
        <Panel title="Session summary" tone="accent">
          <Text color={theme.subtle}>Data path</Text>
          <Text>{createTerminalLink(dir)}</Text>
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
    </Box>
  );
}
