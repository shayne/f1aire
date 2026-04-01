import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from '../../chat-state.js';
import { theme } from '../../theme.js';
import { renderMarkdownToTerminal } from '../../terminal-markdown.js';

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

function padTerminalLines(text: string, width: number): string {
  if (width <= 0 || !text) return text;
  const lines = text.split('\n');
  return lines
    .map((line) => {
      const visible = stripAnsi(line);
      const pad = width - visible.length;
      return pad > 0 ? `${line}${' '.repeat(pad)}` : line;
    })
    .join('\n');
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

function Spinner({ active }: { active: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIndex((current) => (current + 1) % 4), 80);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  return React.createElement(
    Text,
    { color: theme.muted },
    ['|', '/', '-', '\\'][index],
  );
}

function createLabelRow(
  key: string,
  label: string,
  color: string,
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
  const color = message.role === 'assistant' ? theme.assistant : theme.user;

  const renderedLines =
    message.role === 'assistant'
      ? padTerminalLines(
          wrapAnsiText(
            renderMarkdownToTerminal(message.content, messageWidth),
            messageWidth,
          ).join('\n'),
          messageWidth,
        ).split('\n')
      : padTerminalLines(
          message.content
            .split('\n')
            .flatMap((line) => wrapPlainTextLine(line, messageWidth))
            .join('\n'),
          messageWidth,
        ).split('\n');

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

function createPendingRows(status: string): TranscriptRow[] {
  return [
    createLabelRow('pending-label', 'Engineer', theme.assistant),
    {
      key: 'pending-status',
      kind: 'pending-status',
      plainText: status,
      node: React.createElement(
        Box,
        { gap: 1 },
        React.createElement(Spinner, { active: true }),
        React.createElement(
          Text,
          { color: theme.muted, wrap: 'truncate-end' },
          status,
        ),
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

  for (let i = 0; i < messages.length; i += 1) {
    rows.push(...createMessageRows(messages[i], `m-${i}`, messageWidth));
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
