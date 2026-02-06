import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
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

const MessageBlock = React.memo(function MessageBlock({
  role,
  content,
}: ChatMessage) {
  const label = role === 'assistant' ? 'Engineer' : 'You';
  const color = role === 'assistant' ? theme.assistant : theme.user;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color}>{label}</Text>
      <Box paddingLeft={2}>
        <Text>{content}</Text>
      </Box>
    </Box>
  );
});

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
  visibleMessages: ChatMessage[];
  isStreaming: boolean;
  status: string | null;
  streamingText: string;
  height?: number;
  onRender?: () => void;
};

const ConversationPanel = React.memo(function ConversationPanel({
  visibleMessages,
  isStreaming,
  status,
  streamingText,
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
      <Box flexDirection="column" gap={1}>
        {visibleMessages.map((m, i) => (
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
              <Text>{streamingText}</Text>
            </Box>
          </Box>
        ) : null}
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
  const renderedStreamingText = useMemo(() => {
    if (!streamingText) return '';
    return padTerminalLines(
      renderMarkdownToTerminal(streamingText, messageContentWidth),
      messageContentWidth,
    );
  }, [streamingText, messageContentWidth]);

  useEffect(() => {
    onRender?.();
  });

  const inputPanelHeight = 5;
  const panelOverhead = 4;
  const gapBetweenPanels = compact ? 0 : 1;
  const availableForConversation = rows - inputPanelHeight - gapBetweenPanels;
  const conversationPanelHeight = Math.max(availableForConversation, 0);

  const pendingHeight = useMemo(() => {
    return isStreaming && status && !renderedStreamingText ? 3 : 0;
  }, [isStreaming, status, renderedStreamingText]);

  const visibleMessages = useMemo(() => {
    const wrapPlainTextLine = (line: string, width: number) => {
      if (width <= 0) return [line];
      if (line.length <= width) return [line];
      const parts: string[] = [];
      for (let i = 0; i < line.length; i += width) {
        parts.push(line.slice(i, i + width));
      }
      return parts;
    };

    const renderMessageContent = (message: ChatMessage) => {
      if (message.role === 'assistant') {
        return padTerminalLines(
          renderMarkdownToTerminal(message.content, messageContentWidth),
          messageContentWidth,
        );
      }
      const lines = message.content
        .split('\n')
        .flatMap((line) => wrapPlainTextLine(line, messageContentWidth));
      return padTerminalLines(lines.join('\n'), messageContentWidth);
    };

    const getMessageHeight = (message: ChatMessage) => {
      const rendered = renderMessageContent(message);
      const lineCount = Math.max(1, rendered.split('\n').length);
      // label + content + bottom margin
      return 1 + lineCount + 1;
    };

    const availableMessageLines = Math.max(
      conversationPanelHeight - panelOverhead,
      1,
    );

    let remaining = Math.max(availableMessageLines - pendingHeight, 0);
    const visible: ChatMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const height = getMessageHeight(messages[i]);
      if (height > remaining && visible.length > 0) break;
      remaining -= height;
      visible.push({
        ...messages[i],
        content: renderMessageContent(messages[i]),
      });
    }
    return visible.reverse();
  }, [messages, conversationPanelHeight, messageContentWidth, pendingHeight]);

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
          visibleMessages={visibleMessages}
          isStreaming={isStreaming}
          status={status}
          streamingText={renderedStreamingText}
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
