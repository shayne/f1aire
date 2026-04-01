import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { ChatMessage } from '../chat-state.js';
import type { Summary as SummaryData } from '../../core/summary.js';
import type { Meeting, Session } from '../../core/types.js';
import { fitRightPane, getRightPaneMode, getSessionItems } from '../layout.js';
import { Panel } from '../components/Panel.js';
import { theme } from '../theme.js';
import {
  buildTranscriptRows,
  type TranscriptRow,
} from './engineer/transcript-rows.js';
import { useTranscriptViewport } from './engineer/useTranscriptViewport.js';

type ConversationRow = TranscriptRow;

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Text>
      <Text color={theme.muted}>{label}</Text>
      {`: ${value}`}
    </Text>
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

type ConversationPanelProps = {
  visibleRows: ConversationRow[];
  height?: number;
  scrollHint?: string | null;
  onRender?: () => void;
};

const ConversationPanel = React.memo(function ConversationPanel({
  visibleRows,
  height,
  scrollHint,
  onRender,
}: ConversationPanelProps) {
  useEffect(() => {
    onRender?.();
  });

  return (
    <Panel
      title="Conversation"
      tone="accent"
      boxProps={height ? { height, overflow: 'hidden' } : { flexGrow: 1 }}
    >
      <Box flexDirection="column">
        {scrollHint ? (
          <Text color={theme.muted} wrap="truncate-end">
            {scrollHint}
          </Text>
        ) : null}
        {visibleRows.map((row) => (
          <Box key={row.key}>{row.node}</Box>
        ))}
      </Box>
    </Panel>
  );
});

type AskInputProps = {
  onSend: (text: string) => void;
  height?: number;
};

const AskInput = React.memo(function AskInput({
  onSend,
  height,
}: AskInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <Panel
      title="Ask the engineer"
      tone="muted"
      boxProps={height ? { height } : undefined}
    >
      <Box>
        <Text color={theme.muted}>› </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Ask about pace, gaps, tyres..."
        />
      </Box>
    </Panel>
  );
});

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
  pythonCode,
  asOfLabel,
  maxHeight,
  onConversationRender,
  onRender,
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
  pythonCode?: string;
  asOfLabel?: string | null;
  maxHeight?: number;
  onConversationRender?: () => void;
  onRender?: () => void;
}) {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 100;
  const rows = maxHeight ?? stdout?.rows ?? 40;
  const compact = rows < 32;
  const rightPaneMode = getRightPaneMode(rows);
  const isNarrow = columns < 96;
  const rightWidth = isNarrow
    ? undefined
    : Math.min(36, Math.max(28, Math.floor(columns * 0.3)));
  const gutter = isNarrow ? 0 : 2;
  const leftPaneWidth = Math.max(20, columns - (rightWidth ?? 0) - gutter);
  const contentWidth = Math.max(12, leftPaneWidth - 6);
  const messageContentWidth = Math.max(10, contentWidth - 2);

  useEffect(() => {
    onRender?.();
  });

  const inputPanelHeight = 5;
  const panelOverhead = 4;
  const gapBetweenPanels = compact ? 0 : 1;
  const availableForConversation = rows - inputPanelHeight - gapBetweenPanels;
  const conversationPanelHeight = Math.max(availableForConversation, 0);

  const conversationRows = useMemo(
    () =>
      buildTranscriptRows({
        messages,
        streamingText,
        isStreaming,
        status,
        messageWidth: messageContentWidth,
      }),
    [isStreaming, messageContentWidth, messages, status, streamingText],
  );

  const transcriptVersion = messages.length + (isStreaming ? 1 : 0);
  const { scrollHint, visibleWindow } = useTranscriptViewport({
    rowCount: conversationRows.length,
    panelHeight: conversationPanelHeight,
    panelOverhead,
    transcriptVersion,
  });

  const visibleRows = useMemo(
    () => conversationRows.slice(visibleWindow.start, visibleWindow.end),
    [conversationRows, visibleWindow.end, visibleWindow.start],
  );

  const activityEntries = useMemo(() => {
    return activity.length ? activity : status ? [status] : ['Idle'];
  }, [activity, status]);

  const sessionItems = useMemo(() => {
    return getSessionItems({
      mode: rightPaneMode,
      year,
      meetingName: meeting.Name,
      sessionName: session.Name,
      sessionType: session.Type,
      summary,
      asOfLabel,
    });
  }, [
    rightPaneMode,
    year,
    meeting.Name,
    session.Name,
    session.Type,
    summary,
    asOfLabel,
  ]);

  const pythonCodeLines = useMemo(() => {
    if (!pythonCode) return [];
    return pythonCode.split('\n');
  }, [pythonCode]);

  const rightPane = useMemo(() => {
    return fitRightPane({
      rows,
      mode: rightPaneMode,
      sessionItems,
      activityEntries,
      dataItems: [],
      codeLines: pythonCodeLines,
    });
  }, [rows, rightPaneMode, sessionItems, activityEntries, pythonCodeLines]);

  return (
    <Box
      flexDirection={isNarrow ? 'column' : 'row'}
      gap={compact ? 1 : 2}
      height={rows}
    >
      <Box
        flexDirection="column"
        flexGrow={1}
        gap={gapBetweenPanels}
        height={rows}
      >
        <ConversationPanel
          visibleRows={visibleRows}
          height={conversationPanelHeight}
          scrollHint={scrollHint}
          onRender={onConversationRender}
        />
        <AskInput onSend={onSend} height={inputPanelHeight} />
      </Box>
      <Box
        flexDirection="column"
        width={rightWidth}
        flexShrink={0}
        gap={compact ? 0 : 1}
        marginTop={isNarrow ? 1 : 0}
        height={rows}
      >
        <Panel title="Session">
          {rightPane.sessionItems.map((item) => (
            <StatRow key={item.label} label={item.label} value={item.value} />
          ))}
        </Panel>
        {rightPane.showActivity ? (
          <Panel title="Activity" tone={isStreaming ? 'accent' : 'neutral'}>
            <Box flexDirection="column">
              {rightPane.activityEntries.map((entry, index) => {
                const marker =
                  index === rightPane.activityEntries.length - 1 ? '>' : '-';
                return (
                  <Text key={`${entry}-${index}`} color={activityColor(entry)}>
                    {marker} {entry}
                  </Text>
                );
              })}
            </Box>
          </Panel>
        ) : null}
        {rightPane.showCode ? (
          <Panel title="Python" tone="muted">
            <Box flexDirection="column">
              {rightPane.codeLines.map((line, index) => (
                <Text
                  key={`${line}-${index}`}
                  wrap="truncate-end"
                  color={theme.muted}
                >
                  {line}
                </Text>
              ))}
            </Box>
          </Panel>
        ) : null}
      </Box>
    </Box>
  );
}
