import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { ChatMessage } from '../chat-state.js';
import type { Summary as SummaryData } from '../../core/summary.js';
import type { Meeting, Session } from '../../core/types.js';
import { fitRightPane, getRightPaneMode, getSessionItems } from '../layout.js';
import { Panel } from '../components/Panel.js';
import { theme } from '../theme.js';
import { renderMarkdownToTerminal } from '../terminal-markdown.js';

const SPINNER_FRAMES = ['|', '/', '-', '\\'];
const ANSI_SGR_REGEX = /\x1b\[[0-9;]*m/g;

function padTerminalLines(text: string, width: number): string {
  if (width <= 0 || !text) return text;
  const lines = text.split('\n');
  return lines
    .map((line) => {
      const visible = line.replace(ANSI_SGR_REGEX, '');
      const pad = width - visible.length;
      return pad > 0 ? `${line}${' '.repeat(pad)}` : line;
    })
    .join('\n');
}

function wrapAnsiLine(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const visible = text.replace(ANSI_SGR_REGEX, '');
  if (visible.length <= width) return [text];
  const chunks: string[] = [];
  let current = '';
  let visibleCount = 0;
  for (let i = 0; i < text.length; ) {
    if (text[i] === '\u001b') {
      const match = /^\u001b\[[0-9;]*m/.exec(text.slice(i));
      if (match) {
        current += match[0];
        i += match[0].length;
        continue;
      }
    }
    current += text[i];
    i += 1;
    visibleCount += 1;
    if (visibleCount >= width) {
      chunks.push(current);
      current = '';
      visibleCount = 0;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length ? chunks : [''];
}

function wrapAnsiText(text: string, width: number): string[] {
  return text
    .split('\n')
    .flatMap((line) => wrapAnsiLine(line, width));
}

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

type ConversationRow = {
  key: string;
  node: React.ReactNode;
};

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
  onRender?: () => void;
};

const ConversationPanel = React.memo(function ConversationPanel({
  visibleRows,
  height,
  onRender,
}: ConversationPanelProps) {
  useEffect(() => {
    onRender?.();
  });

  return (
    <Panel
      title="Conversation"
      tone="accent"
      boxProps={
        height
          ? { height, overflow: 'hidden' }
          : { flexGrow: 1 }
      }
    >
      <Box flexDirection="column">
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

const AskInput = React.memo(function AskInput({ onSend, height }: AskInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <Panel title="Ask the engineer" tone="muted" boxProps={height ? { height } : undefined}>
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

  const [scrollOffsetLines, setScrollOffsetLines] = useState(0);

  const availableMessageLines = useMemo(() => {
    return Math.max(conversationPanelHeight - panelOverhead, 1);
  }, [conversationPanelHeight]);

  const conversationRows = useMemo(() => {
    const wrapPlainTextLine = (line: string, width: number) => {
      if (width <= 0) return [line];
      if (line.length <= width) return [line];
      const parts: string[] = [];
      for (let i = 0; i < line.length; i += width) {
        parts.push(line.slice(i, i + width));
      }
      return parts;
    };

    const renderMessageLines = (message: ChatMessage) => {
      if (message.role === 'assistant') {
        const rendered = renderMarkdownToTerminal(
          message.content,
          messageContentWidth,
        );
        const wrapped = wrapAnsiText(rendered, messageContentWidth);
        return padTerminalLines(wrapped.join('\n'), messageContentWidth).split('\n');
      }
      const lines = message.content
        .split('\n')
        .flatMap((line) => wrapPlainTextLine(line, messageContentWidth));
      return padTerminalLines(lines.join('\n'), messageContentWidth).split('\n');
    };

    const rows: ConversationRow[] = [];
    const pushMessage = (message: ChatMessage, indexKey: string) => {
      const label = message.role === 'assistant' ? 'Engineer' : 'You';
      const color = message.role === 'assistant' ? theme.assistant : theme.user;
      rows.push({
        key: `${indexKey}-label`,
        node: (
          <Text color={color} wrap="truncate-end">
            {label}
          </Text>
        ),
      });
      const lines = renderMessageLines(message);
      for (let i = 0; i < lines.length; i += 1) {
        rows.push({
          key: `${indexKey}-line-${i}`,
          node: (
            <Text wrap="truncate-end">
              {`  ${lines[i] ?? ''}`}
            </Text>
          ),
        });
      }
      rows.push({
        key: `${indexKey}-spacer`,
        node: <Text wrap="truncate-end"> </Text>,
      });
    };

    for (let i = 0; i < messages.length; i += 1) {
      pushMessage(messages[i], `m-${i}`);
    }

    if (isStreaming) {
      if (streamingText) {
        pushMessage({ role: 'assistant', content: streamingText }, 'stream');
      } else if (status) {
        rows.push({
          key: `pending-label`,
          node: (
            <Text color={theme.assistant} wrap="truncate-end">
              Engineer
            </Text>
          ),
        });
        rows.push({
          key: `pending-status`,
          node: (
            <Box gap={1}>
              <Spinner active={true} />
              <Text color={theme.muted} wrap="truncate-end">
                {status}
              </Text>
            </Box>
          ),
        });
        rows.push({
          key: `pending-spacer`,
          node: <Text wrap="truncate-end"> </Text>,
        });
      }
    }

    return rows;
  }, [messages, isStreaming, status, streamingText, messageContentWidth]);

  const maxScrollLines = useMemo(() => {
    return Math.max(conversationRows.length - availableMessageLines, 0);
  }, [conversationRows.length, availableMessageLines]);

  const effectiveScrollOffsetLines = Math.min(scrollOffsetLines, maxScrollLines);

  const visibleRows = useMemo(() => {
    const start = Math.max(
      conversationRows.length - availableMessageLines - effectiveScrollOffsetLines,
      0,
    );
    const end = start + availableMessageLines;
    return conversationRows.slice(start, end);
  }, [
    conversationRows,
    availableMessageLines,
    effectiveScrollOffsetLines,
  ]);

  const scrollStep = Math.max(1, Math.floor(availableMessageLines * 0.7));

  useInput((_, key) => {
    if (key.pageUp) {
      setScrollOffsetLines((current) =>
        Math.min(current + scrollStep, maxScrollLines),
      );
      return;
    }
    if (key.pageDown) {
      setScrollOffsetLines((current) => Math.max(current - scrollStep, 0));
      return;
    }
    if (key.home) {
      setScrollOffsetLines(maxScrollLines);
      return;
    }
    if (key.end) {
      setScrollOffsetLines(0);
    }
  });

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
                <Text key={`${line}-${index}`} wrap="truncate-end" color={theme.muted}>
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
