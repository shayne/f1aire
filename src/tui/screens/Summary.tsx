import React from 'react';
import { Box, Text, useTerminalSize } from '#ink';
import type { Summary as SummaryData } from '../../core/summary.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { SelectList } from '../components/SelectList.js';
import { createTerminalLink } from '../terminal-chrome.js';
import { useTheme } from '../theme/provider.js';

export type SummaryLaunchAction = 'resume' | 'fresh';

export function Summary({
  hasPriorTranscript = false,
  launchAction = null,
  onResume,
  onStartFresh,
  resumeError,
  summary,
  dir,
}: {
  hasPriorTranscript?: boolean;
  launchAction?: SummaryLaunchAction | null;
  onResume?: () => void;
  onStartFresh?: () => void;
  resumeError?: string | null;
  summary: SummaryData;
  dir: string;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
  const isLaunchingEngineer = launchAction != null;
  const summaryActions = [
    ...(hasPriorTranscript && onResume
      ? ([
          {
            label: 'Resume chat',
            value: 'resume' as const,
          },
        ] as const)
      : []),
    ...(onStartFresh
      ? ([
          {
            label: hasPriorTranscript
              ? 'New conversation'
              : 'Start conversation',
            value: 'fresh' as const,
          },
        ] as const)
      : []),
  ];

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
                <Box flexDirection="column">
                  <Text color={theme.text.muted} dimColor>
                    Prior engineer transcript found. Resume it, or start a new
                    conversation with this session data.
                  </Text>
                  {resumeError ? (
                    <Box marginTop={1}>
                      <Text color={theme.status.error}>
                        Resume failed: {resumeError}
                      </Text>
                    </Box>
                  ) : null}
                </Box>
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
          {isLaunchingEngineer ? (
            <Box marginTop={1}>
              <Text color={theme.status.tool}>
                Preparing engineer session...
              </Text>
            </Box>
          ) : null}
          {summaryActions.length > 0 ? (
            <Box marginTop={1}>
              <SelectList
                isFocused={!isLaunchingEngineer}
                items={summaryActions}
                onSelect={(action) => {
                  if (action === 'resume') {
                    onResume?.();
                    return;
                  }
                  onStartFresh?.();
                }}
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
