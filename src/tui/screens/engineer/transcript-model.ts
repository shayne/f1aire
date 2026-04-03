import type { TranscriptEvent } from '../../../agent/transcript-events.js';

const ANSI_SGR_REGEX = /\x1b\[[0-9;]*m/g;

type TranscriptModelLine = {
  text: string;
  plainText: string;
};

export type TranscriptModelRow =
  | {
      id: string;
      kind: 'message';
      role: 'user' | 'assistant';
      label: string;
      lines: TranscriptModelLine[];
      streaming: boolean;
    }
  | {
      id: string;
      kind: 'tool';
      role: 'tool';
      toolName: string;
      label: string;
      lines: TranscriptModelLine[];
      error?: string;
    };

export type TranscriptModel = {
  rows: TranscriptModelRow[];
  version: string;
};

export type BuildTranscriptModelOptions = {
  events: TranscriptEvent[];
  messageWidth: number;
  renderAssistantText?: (text: string, width: number) => string;
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

function wrapAnsiText(text: string, width: number): TranscriptModelLine[] {
  return text
    .split('\n')
    .flatMap((line) => wrapAnsiLine(line, width))
    .map((textLine) => ({
      text: textLine,
      plainText: stripAnsi(textLine),
    }));
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

function wrapPlainText(text: string, width: number): TranscriptModelLine[] {
  return text
    .split('\n')
    .flatMap((line) => wrapPlainTextLine(line, width))
    .map((textLine) => ({
      text: textLine,
      plainText: textLine,
    }));
}

function buildRowVersion(row: TranscriptModelRow): string {
  const lineText = row.lines
    .map((line) => `${line.text}\u0003${line.plainText}`)
    .join('\n');
  if (row.kind === 'tool') {
    return [
      row.id,
      row.kind,
      row.role,
      row.toolName,
      row.label,
      row.error ?? '',
      lineText,
    ].join('\u0002');
  }

  return [
    row.id,
    row.kind,
    row.role,
    row.label,
    row.streaming ? 'streaming' : 'final',
    lineText,
  ].join('\u0002');
}

export function buildTranscriptModel({
  events,
  messageWidth,
  renderAssistantText = (text) => text,
}: BuildTranscriptModelOptions): TranscriptModel {
  const rows = events.map((event): TranscriptModelRow => {
    if (event.type === 'user-message') {
      return {
        id: event.id,
        kind: 'message',
        role: 'user',
        label: 'You',
        lines: wrapPlainText(event.text, messageWidth),
        streaming: false,
      };
    }

    if (event.type === 'assistant-message') {
      return {
        id: event.id,
        kind: 'message',
        role: 'assistant',
        label: 'Engineer',
        lines: wrapAnsiText(
          renderAssistantText(event.text, messageWidth),
          messageWidth,
        ),
        streaming: event.streaming,
      };
    }

    return {
      id: event.id,
      kind: 'tool',
      role: 'tool',
      toolName: event.toolName,
      label: event.label,
      lines: wrapPlainText(event.label, messageWidth),
      ...(event.type === 'tool-result' && event.error
        ? { error: event.error }
        : {}),
    };
  });

  return {
    rows,
    version: rows.map((row) => buildRowVersion(row)).join('\u0001'),
  };
}
