import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { ChatMessage } from '../chat-state.js';
import type { Summary as SummaryData } from '../../core/summary.js';
import type { Meeting, Session } from '../../core/types.js';
import { Panel } from '../components/Panel.js';
import { theme } from '../theme.js';

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

type DataStatus = {
  drivers: number | null;
  laps: number | null;
  hasLastLap: boolean | null;
  hasSectors: boolean | null;
  hasStints: boolean | null;
  hasCarData: boolean | null;
  hasPosition: boolean | null;
  hasRaceControl: boolean | null;
  hasTeamRadio: boolean | null;
  hasWeather: boolean | null;
  hasPitStops: boolean | null;
};

function Spinner({ active }: { active: boolean }) {
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
  return <Text color={theme.muted}>{SPINNER_FRAMES[index]}</Text>;
}

function MessageBlock({ role, content }: ChatMessage) {
  const label = role === 'assistant' ? 'Engineer' : 'You';
  const color = role === 'assistant' ? theme.assistant : theme.user;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color}>{label}</Text>
      <Box paddingLeft={2}>
        <Box flexDirection="column">
          {content.split('\n').map((line, index) => (
            <Text key={`${line}-${index}`}>{line}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.muted}>{label}</Text>
      <Text>{value}</Text>
    </Box>
  );
}

function activityColor(entry: string) {
  const lower = entry.toLowerCase();
  if (lower.startsWith('error')) return theme.status.error;
  if (lower.includes('running tool')) return theme.status.tool;
  if (lower.includes('processing')) return theme.status.tool;
  if (lower.includes('thinking')) return theme.status.thinking;
  if (lower.includes('ready')) return theme.status.ok;
  return theme.muted;
}

export function EngineerChat({
  messages,
  onSend,
  streamingText,
  isStreaming,
  status,
  year,
  meeting,
  session,
  summary,
  activity,
  modelId,
  dataStatus,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  streamingText: string;
  isStreaming: boolean;
  status: string | null;
  year: number;
  meeting: Meeting;
  session: Session;
  summary: SummaryData | null;
  activity: string[];
  modelId: string | null;
  dataStatus: DataStatus | null;
}) {
  const [input, setInput] = useState('');
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 100;
  const isNarrow = columns < 96;
  const rightWidth = isNarrow
    ? undefined
    : Math.min(36, Math.max(28, Math.floor(columns * 0.3)));

  useInput((_, key) => {
    if (key.return && input.trim().length > 0) {
      onSend(input.trim());
      setInput('');
    }
  });

  const activityEntries = activity.length
    ? activity
    : status
      ? [status]
      : ['Idle'];
  const recentActivity = activityEntries.slice(-5);

  return (
    <Box flexDirection={isNarrow ? 'column' : 'row'} gap={2}>
      <Box flexDirection="column" flexGrow={1} gap={1}>
        <Panel title="Conversation" tone="accent" boxProps={{ flexGrow: 1 }}>
          <Box flexDirection="column" gap={1}>
            {messages.map((m, i) => (
              <MessageBlock key={i} role={m.role} content={m.content} />
            ))}
            {isStreaming && status && !streamingText ? (
              <Box flexDirection="column" marginBottom={1}>
                <Text color={theme.assistant}>Engineer</Text>
                <Box gap={1} paddingLeft={2}>
                  <Spinner active={true} />
                  <Text color={theme.muted}>{status}</Text>
                </Box>
              </Box>
            ) : null}
            {streamingText ? (
              <Box flexDirection="column" marginBottom={1}>
                <Text color={theme.assistant}>Engineer</Text>
                <Box paddingLeft={2}>
                  <Box flexDirection="column">
                    {streamingText.split('\n').map((line, index) => (
                      <Text key={`${line}-${index}`}>{line}</Text>
                    ))}
                  </Box>
                </Box>
              </Box>
            ) : null}
          </Box>
        </Panel>
        <Panel title="Ask the engineer" tone="muted">
          <Box>
            <Text color={theme.muted}>› </Text>
            <TextInput
              value={input}
              onChange={setInput}
              placeholder="Ask about pace, gaps, tyres..."
            />
          </Box>
        </Panel>
      </Box>
      <Box
        flexDirection="column"
        width={rightWidth}
        flexShrink={0}
        gap={1}
        marginTop={isNarrow ? 1 : 0}
      >
        <Panel title="Session">
          <StatBlock label="Year" value={String(year)} />
          <StatBlock label="Event" value={meeting.Name} />
          <StatBlock
            label="Session"
            value={`${session.Name} (${session.Type})`}
          />
          {summary ? (
            <>
              <StatBlock
                label="Winner"
                value={summary.winner ? `${summary.winner.name} (#${summary.winner.number})` : 'n/a'}
              />
              <StatBlock
                label="Fastest lap"
                value={summary.fastestLap
                  ? `${summary.fastestLap.name} (#${summary.fastestLap.number}) ${summary.fastestLap.time}`
                  : 'n/a'}
              />
              <StatBlock
                label="Total laps"
                value={summary.totalLaps ? String(summary.totalLaps) : 'n/a'}
              />
            </>
          ) : null}
        </Panel>
        <Panel title="Activity" tone={isStreaming ? 'accent' : 'neutral'}>
          <Box gap={1} marginBottom={1}>
            <Spinner active={isStreaming} />
            <Text color={isStreaming ? theme.status.thinking : theme.muted}>
              {status ?? (isStreaming ? 'Working...' : 'Idle')}
            </Text>
          </Box>
          <Box flexDirection="column">
            {recentActivity.map((entry, index) => {
              const marker = index === recentActivity.length - 1 ? '>' : '-';
              return (
                <Text key={`${entry}-${index}`} color={activityColor(entry)}>
                  {marker} {entry}
                </Text>
              );
            })}
          </Box>
        </Panel>
        <Panel title="Data">
          <StatBlock label="Model" value={modelId ?? 'default'} />
          <StatBlock
            label="Drivers"
            value={
              dataStatus?.drivers === null || dataStatus?.drivers === undefined
                ? 'n/a'
                : String(dataStatus.drivers)
            }
          />
          <StatBlock
            label="Laps seen"
            value={
              dataStatus?.laps === null || dataStatus?.laps === undefined
                ? 'n/a'
                : String(dataStatus.laps)
            }
          />
          <StatBlock
            label="Lap times"
            value={
              dataStatus?.hasLastLap === null
                ? 'n/a'
                : dataStatus?.hasLastLap
                  ? 'yes'
                  : 'no'
            }
          />
          <StatBlock
            label="Sector splits"
            value={
              dataStatus?.hasSectors === null
                ? 'n/a'
                : dataStatus?.hasSectors
                  ? 'yes'
                  : 'no'
            }
          />
          <StatBlock
            label="Tyre stints"
            value={
              dataStatus?.hasStints === null
                ? 'n/a'
                : dataStatus?.hasStints
                  ? 'yes'
                  : 'no'
            }
          />
          <StatBlock
            label="Car telemetry"
            value={
              dataStatus?.hasCarData === null
                ? 'n/a'
                : dataStatus?.hasCarData
                  ? 'yes'
                  : 'no'
            }
          />
          <StatBlock
            label="Position data"
            value={
              dataStatus?.hasPosition === null
                ? 'n/a'
                : dataStatus?.hasPosition
                  ? 'yes'
                  : 'no'
            }
          />
          <StatBlock
            label="Race control"
            value={
              dataStatus?.hasRaceControl === null
                ? 'n/a'
                : dataStatus?.hasRaceControl
                  ? 'yes'
                  : 'no'
            }
          />
          <StatBlock
            label="Pit data"
            value={
              dataStatus?.hasPitStops === null
                ? 'n/a'
                : dataStatus?.hasPitStops
                  ? 'yes'
                  : 'no'
            }
          />
          <StatBlock
            label="Team radio"
            value={
              dataStatus?.hasTeamRadio === null
                ? 'n/a'
                : dataStatus?.hasTeamRadio
                  ? 'yes'
                  : 'no'
            }
          />
          <StatBlock
            label="Weather"
            value={
              dataStatus?.hasWeather === null
                ? 'n/a'
                : dataStatus?.hasWeather
                  ? 'yes'
                  : 'no'
            }
          />
        </Panel>
      </Box>
    </Box>
  );
}
