import React from 'react';
import { Box, Text } from '#ink';
import type { Color } from '../../../vendor/ink/styles.js';
import { Panel } from '../../components/Panel.js';
import { theme } from '../../theme.js';

const MAX_ACTIVITY_LINES = 3;
const MAX_PYTHON_PREVIEW_LINES = 3;
const PANEL_OVERHEAD_LINES = 4;
const EMPTY_ACTIVITY_LABEL = 'No tool activity yet';

function activityColor(entry: string): Color {
  const lower = entry.toLowerCase();
  if (lower.startsWith('error')) return theme.status.error;
  return theme.subtle;
}

function getRecentActivity(activity: string[]): string[] {
  return activity.slice(-MAX_ACTIVITY_LINES);
}

function getPythonPreview(pythonCode: string): string[] {
  if (!pythonCode) return [];
  return pythonCode
    .split('\n')
    .filter(Boolean)
    .slice(-MAX_PYTHON_PREVIEW_LINES);
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
  if (!isExpanded) return 0;

  const pythonPreview = getPythonPreview(pythonCode);
  const activityRows = Math.max(1, getRecentActivity(activity).length);

  return (
    1 +
    PANEL_OVERHEAD_LINES +
    activityRows +
    (pythonPreview.length > 0 ? 1 + pythonPreview.length : 0)
  );
}

export function EngineerDetails({
  activity,
  pythonCode,
  isExpanded,
}: {
  activity: string[];
  pythonCode: string;
  isExpanded: boolean;
}): React.JSX.Element {
  if (!isExpanded) {
    return <Box />;
  }

  const recentActivity = getRecentActivity(activity);
  const pythonPreview = getPythonPreview(pythonCode);

  return (
    <Box flexDirection="column">
      <Panel title="Details" tone="muted">
        <Box flexDirection="column">
          {recentActivity.map((entry, index) => (
            <Text
              key={`${index}-${entry}`}
              color={activityColor(entry)}
              dimColor={!entry.toLowerCase().startsWith('error')}
            >
              {`- ${entry}`}
            </Text>
          ))}
          {recentActivity.length === 0 ? (
            <Text color={theme.subtle} dimColor>
              {EMPTY_ACTIVITY_LABEL}
            </Text>
          ) : null}
          {pythonPreview.length > 0 ? (
            <Box flexDirection="column">
              <Text color={theme.subtle} dimColor>
                Python
              </Text>
              {pythonPreview.map((line, index) => (
                <Text
                  key={`${index}-${line}`}
                  color={theme.subtle}
                  dimColor
                  wrap="truncate-end"
                >
                  {line}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      </Panel>
    </Box>
  );
}
