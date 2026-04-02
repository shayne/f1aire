import React from 'react';
import { Text } from '#ink';
import type { Color } from '../../../vendor/ink/styles.js';
import type { ChatMessage } from '../../chat-state.js';
import { renderMarkdownToTerminal } from '../../terminal-markdown.js';
import { theme } from '../../theme.js';

const ANSI_SGR_REGEX = /\x1b\[[0-9;]*m/g;

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

function stripAnsi(text: string): string {
  return text.replace(ANSI_SGR_REGEX, '');
}

function wrapAnsiLine(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const visible = stripAnsi(text);
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
  return text.split('\n').flatMap((line) => wrapAnsiLine(line, width));
}

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

function createMessageRows(
  message: ChatMessage,
  indexKey: string,
  messageWidth: number,
): TranscriptRow[] {
  const label = message.role === 'assistant' ? 'Engineer' : 'You';
  const color: Color =
    message.role === 'assistant' ? theme.assistant : theme.user;

  const renderedLines =
    message.role === 'assistant'
      ? wrapAnsiText(
          renderMarkdownToTerminal(message.content, messageWidth),
          messageWidth,
        )
      : message.content
          .split('\n')
          .flatMap((line) => wrapPlainTextLine(line, messageWidth));

  const rows: TranscriptRow[] = [
    createLabelRow(`${indexKey}-label`, label, color),
  ];

  for (let i = 0; i < renderedLines.length; i += 1) {
    const line = renderedLines[i] ?? '';
    rows.push({
      key: `${indexKey}-line-${i}`,
      kind: 'message-line',
      plainText: stripAnsi(line),
      node: React.createElement(Text, { wrap: 'truncate-end' }, `  ${line}`),
    });
  }

  rows.push(createSpacerRow(`${indexKey}-spacer`));
  return rows;
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

function createPendingRows(status: string): TranscriptRow[] {
  const statusText = `  ... ${status}`;

  return [
    createLabelRow('pending-label', 'Engineer', theme.assistant),
    {
      key: 'pending-status',
      kind: 'pending-status',
      plainText: statusText,
      node: React.createElement(
        Text,
        { color: theme.assistant, dimColor: true, wrap: 'truncate-end' },
        statusText,
      ),
    },
    createSpacerRow('pending-spacer'),
  ];
}

export function buildTranscriptRows({
  messages,
  streamingText,
  isStreaming,
  status,
  messageWidth,
}: BuildTranscriptRowsOptions): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  const hasUserTurn = messages.some((message) => message.role === 'user');

  for (let i = 0; i < messages.length; i += 1) {
    rows.push(...createMessageRows(messages[i], `m-${i}`, messageWidth));
  }

  if (!hasUserTurn && !isStreaming && !status) {
    rows.push(...createOnboardingRows(messageWidth));
  }

  if (isStreaming) {
    if (streamingText) {
      rows.push(
        ...createMessageRows(
          { role: 'assistant', content: streamingText },
          'stream',
          messageWidth,
        ),
      );
    } else if (status) {
      rows.push(...createPendingRows(status));
    }
  }

  return rows;
}
