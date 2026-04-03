import React, { useEffect, useState } from 'react';
import { Text, Box, useTerminalSize } from '#ink';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { useTheme } from '../theme/provider.js';

const SPINNER_FRAMES = ['|', '/', '-', '\\'];
const BAR_WIDTH = 20;

type RuntimeProgress = {
  phase: 'downloading' | 'extracting' | 'ready';
  downloadedBytes?: number;
  totalBytes?: number;
};

function Spinner({ active }: { active: boolean }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(
      () => setIndex((current) => (current + 1) % SPINNER_FRAMES.length),
      80,
    );
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;
  return (
    <Text color={theme.text.muted} dimColor>
      {SPINNER_FRAMES[index]}
    </Text>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)}${units[unitIndex]}`;
}

function renderBar(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return `[${'='.repeat(filled)}${'-'.repeat(empty)}]`;
}

export function RuntimePreparing({
  message,
  progress,
}: {
  message: string;
  progress?: RuntimeProgress;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
  const isDownloading = progress?.phase === 'downloading';
  const totalBytes = progress?.totalBytes ?? 0;
  const downloadedBytes = progress?.downloadedBytes ?? 0;
  const hasTotal = isDownloading && totalBytes > 0;
  const percent = hasTotal ? downloadedBytes / totalBytes : 0;
  const showSpinner = progress?.phase === 'extracting' || (isDownloading && !hasTotal);

  return (
    <ScreenLayout
      columns={columns}
      title="Preparing Python runtime"
      subtitle="f1aire is starting the local tools used by engineer analysis."
      primary={
        <Panel title="Runtime status" tone="accent" paddingY={1}>
          <Box flexDirection="column" gap={1}>
            <Box gap={1}>
              <Spinner active={showSpinner} />
              <Text color={theme.text.primary}>{message}</Text>
            </Box>
            {hasTotal ? (
              <Box flexDirection="column">
                <Text color={theme.status.tool}>{renderBar(percent)}</Text>
                <Text color={theme.text.muted} dimColor>
                  {`${Math.round(percent * 100)}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`}
                </Text>
              </Box>
            ) : null}
          </Box>
        </Panel>
      }
      details={
        <Panel title="First run">
          <Text color={theme.text.muted} dimColor>
            f1aire downloads Pyodide once and reuses it from your user data
            directory.
          </Text>
          <Text color={theme.text.muted} dimColor>
            First run may download ~200MB of assets. Keep this terminal open.
          </Text>
        </Panel>
      }
    />
  );
}
