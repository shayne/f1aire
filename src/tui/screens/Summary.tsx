import React from 'react';
import { Box, Text, useTerminalSize } from '#ink';
import type { Summary as SummaryData } from '../../core/summary.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { SelectList } from '../components/SelectList.js';
import { createTerminalLink } from '../terminal-chrome.js';
import { useTheme } from '../theme/provider.js';

export function Summary({
  hasPriorTranscript = false,
  onResume,
  summary,
  dir,
}: {
  hasPriorTranscript?: boolean;
  onResume?: () => void;
  summary: SummaryData;
  dir: string;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();

  return (
    <ScreenLayout
      columns={columns}
      title="Session ready"
      subtitle="The race engineer can use this downloaded timing data immediately."
      primary={
        <Box flexDirection="column">
          <Panel title="Session summary" tone="accent">
            <Text color={theme.status.ok}>Downloaded and indexed.</Text>
            {hasPriorTranscript ? (
              <Box marginTop={1}>
                <Text color={theme.text.muted} dimColor>
                  Prior engineer transcript found. Press Enter to continue the
                  previous session.
                </Text>
              </Box>
            ) : null}
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.text.primary}>
                Winner: {summary.winner ? summary.winner.name : 'Unknown'}
              </Text>
              <Text color={theme.text.primary}>
                Fastest lap:{' '}
                {summary.fastestLap
                  ? `${summary.fastestLap.name} (${summary.fastestLap.time})`
                  : 'Unknown'}
              </Text>
              <Text color={theme.text.primary}>
                Total laps: {summary.totalLaps ?? 'Unknown'}
              </Text>
            </Box>
          </Panel>
          {hasPriorTranscript && onResume ? (
            <Box marginTop={1}>
              <SelectList
                items={[
                  {
                    label: 'Resume prior engineer transcript',
                    value: 'resume' as const,
                  },
                ]}
                onSelect={() => onResume()}
              />
            </Box>
          ) : null}
        </Box>
      }
      details={
        <Panel title="Data path">
          <Text color={theme.text.muted} dimColor>
            Session files
          </Text>
          <Text>{createTerminalLink(dir)}</Text>
          <Box marginTop={1}>
            <Text color={theme.text.muted} dimColor>
              Use this directory if you want to inspect raw timing data outside
              f1aire.
            </Text>
          </Box>
        </Panel>
      }
    />
  );
}
