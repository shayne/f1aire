import React from 'react';
import { Box, Text } from 'ink';
import { Panel } from '../../components/Panel.js';
import { getSessionItems, type SessionSummary } from '../../layout.js';
import { theme } from '../../theme.js';

const MAX_ACTIVITY_LINES = 3;
const MAX_PYTHON_PREVIEW_LINES = 3;
const PANEL_OVERHEAD_LINES = 4;

function activityColor(entry: string) {
  const lower = entry.toLowerCase();
  if (lower.startsWith('error')) return theme.status.error;
  if (lower.includes('running tool')) return theme.status.tool;
  if (lower.includes('processing')) return theme.status.tool;
  if (lower.includes('thinking')) return theme.status.thinking;
  if (lower.includes('ready')) return theme.status.ok;
  return theme.muted;
}

function getRecentActivity(activity: string[]): string[] {
  if (activity.length === 0) return ['Idle'];
  return activity.slice(-MAX_ACTIVITY_LINES);
}

function getPythonPreview(pythonCode: string): string[] {
  if (!pythonCode) return [];
  return pythonCode.split('\n').filter(Boolean).slice(-MAX_PYTHON_PREVIEW_LINES);
}

export function getEngineerDetailsHeight({
  isExpanded,
  activity,
  pythonCode,
}: {
  isExpanded: boolean;
  activity: string[];
  pythonCode: string;
}): number {
  if (!isExpanded) return 1;

  const pythonPreview = getPythonPreview(pythonCode);

  return (
    1 +
    PANEL_OVERHEAD_LINES +
    getRecentActivity(activity).length +
    (pythonPreview.length > 0 ? 1 + pythonPreview.length : 0)
  );
}

export function EngineerDetails({
  year,
  meetingName,
  sessionName,
  sessionType,
  summary,
  asOfLabel,
  activity,
  pythonCode,
  isExpanded,
}: {
  year: number;
  meetingName: string;
  sessionName: string;
  sessionType: string;
  summary: SessionSummary | null;
  asOfLabel: string | null;
  activity: string[];
  pythonCode: string;
  isExpanded: boolean;
}): React.JSX.Element {
  const sessionItems = getSessionItems({
    mode: 'compact',
    year,
    meetingName,
    sessionName,
    sessionType,
    summary,
    asOfLabel,
  });
  const recentActivity = getRecentActivity(activity);
  const latestActivity = recentActivity[recentActivity.length - 1] ?? 'Idle';
  const pythonPreview = getPythonPreview(pythonCode);

  return (
    <Box flexDirection="column">
      <Text color={theme.muted} wrap="truncate-end">
        {sessionItems.map((item) => `${item.label}: ${item.value}`).join(' · ')}
        {` · Status: ${latestActivity}`}
      </Text>
      {isExpanded ? (
        <Panel title="Details" tone="muted">
          <Box flexDirection="column">
            {recentActivity.map((entry, index) => (
              <Text key={`${index}-${entry}`} color={activityColor(entry)}>
                {index === recentActivity.length - 1 ? '> ' : '- '}
                {entry}
              </Text>
            ))}
            {pythonPreview.length > 0 ? (
              <Box flexDirection="column">
                <Text color={theme.panelTitle}>Python</Text>
                {pythonPreview.map((line, index) => (
                  <Text
                    key={`${index}-${line}`}
                    color={theme.muted}
                    wrap="truncate-end"
                  >
                    {line}
                  </Text>
                ))}
              </Box>
            ) : null}
          </Box>
        </Panel>
      ) : null}
    </Box>
  );
}
