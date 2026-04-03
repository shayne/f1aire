import React from 'react';
import { Text } from '#ink';
import type { TranscriptEvent } from '../../../agent/transcript-events.js';
import type { Color } from '../../../vendor/ink/styles.js';
import type { ChatMessage } from '../../chat-state.js';
import { renderMarkdownToTerminal } from '../../terminal-markdown.js';
import { theme } from '../../theme.js';
import { buildTranscriptModel } from './transcript-model.js';

type TranscriptRowKind = 'label' | 'message-line' | 'spacer' | 'pending-status';

export type TranscriptRow = {
  key: string;
  kind: TranscriptRowKind;
  plainText: string;
  node: React.ReactNode;
};

export type BuildTranscriptRowsOptions = {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  status: string | null;
  messageWidth: number;
};

function wrapPlainTextLine(line: string, width: number): string[] {
  if (width <= 0) return [line];
  if (line.length <= width) return [line];
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += width) {
    parts.push(line.slice(i, i + width));
  }
  return parts;
}

function createLabelRow(
  key: string,
  label: string,
  color: Color,
): TranscriptRow {
  return {
    key,
    kind: 'label',
    plainText: label,
    node: React.createElement(Text, { color, wrap: 'truncate-end' }, label),
  };
}

function createSpacerRow(key: string): TranscriptRow {
  return {
    key,
    kind: 'spacer',
    plainText: '',
    node: React.createElement(Text, { wrap: 'truncate-end' }, ' '),
  };
}

function createOnboardingRows(messageWidth: number): TranscriptRow[] {
  const lines = wrapPlainTextLine(
    'Ask about pace, tyres, pit windows, or traffic.',
    messageWidth,
  );

  return [
    ...lines.map((line, index) => ({
      key: `intro-line-${index}`,
      kind: 'message-line' as const,
      plainText: line,
      node: React.createElement(
        Text,
        { color: theme.subtle, dimColor: true, wrap: 'truncate-end' },
        line,
      ),
    })),
    createSpacerRow('intro-spacer'),
  ];
}

function createTranscriptEventRows({
  messages,
  streamingText,
  isStreaming,
  messageWidth,
}: {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  messageWidth: number;
}): TranscriptRow[] {
  const events: TranscriptEvent[] = messages.map((message, index) => {
    if (message.role === 'assistant') {
      return {
        id: `m-${index}`,
        type: 'assistant-message',
        text: message.content,
        streaming: false,
      };
    }

    return {
      id: `m-${index}`,
      type: 'user-message',
      text: message.content,
    };
  });

  if (isStreaming && streamingText) {
    events.push({
      id: 'stream',
      type: 'assistant-message',
      text: streamingText,
      streaming: true,
    });
  }

  const model = buildTranscriptModel({
    events,
    messageWidth,
    renderAssistantText: renderMarkdownToTerminal,
  });
  const rows: TranscriptRow[] = [];

  for (const row of model.rows) {
    const color: Color =
      row.role === 'assistant'
        ? theme.assistant
        : row.role === 'user'
          ? theme.user
          : theme.subtle;

    rows.push(createLabelRow(`${row.id}-label`, row.label, color));

    for (let i = 0; i < row.lines.length; i += 1) {
      const line = row.lines[i] ?? { plainText: '', text: '' };
      rows.push({
        key: `${row.id}-line-${i}`,
        kind: 'message-line',
        plainText: line.plainText,
        node: React.createElement(
          Text,
          { wrap: 'truncate-end' },
          `  ${line.text}`,
        ),
      });
    }

    rows.push(createSpacerRow(`${row.id}-spacer`));
  }

  return rows;
}

export function buildTranscriptRows({
  messages,
  streamingText,
  isStreaming,
  status,
  messageWidth,
}: BuildTranscriptRowsOptions): TranscriptRow[] {
  const rows: TranscriptRow[] = createTranscriptEventRows({
    messages,
    streamingText,
    isStreaming,
    messageWidth,
  });
  const hasUserTurn = messages.some((message) => message.role === 'user');

  if (!hasUserTurn && !isStreaming && !status) {
    rows.push(...createOnboardingRows(messageWidth));
  }

  return rows;
}
