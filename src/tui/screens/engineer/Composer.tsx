import React, { useMemo } from 'react';
import { Box, Text, useInput, type Key } from '#ink';
import { Panel } from '../../components/Panel.js';
import { theme } from '../../theme.js';
import {
  getComposerVisibleLines,
  type ComposerState,
} from './useComposerState.js';

function wrapComposerLine(line: string, width: number): string[] {
  if (width <= 0) return [line];
  if (line.length === 0) return [''];
  const segments: string[] = [];
  for (let i = 0; i < line.length; i += width) {
    segments.push(line.slice(i, i + width));
  }
  return segments;
}

function getComposerLayout(
  draft: string,
  cursor: number,
  width: number,
): {
  lineIndex: number;
  column: number;
  lines: string[];
} {
  const rawLines = draft.split('\n');
  const lines = rawLines.flatMap((line) => wrapComposerLine(line, width));
  const safeCursor = Math.max(0, Math.min(cursor, draft.length));
  let draftOffset = 0;
  let wrappedOffset = 0;

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i] ?? '';
    const wrappedLines = wrapComposerLine(line, width);
    const lineEnd = draftOffset + line.length;

    if (safeCursor <= lineEnd) {
      const offsetInLine = safeCursor - draftOffset;
      const lineWrapIndex =
        width > 0
          ? Math.min(Math.floor(offsetInLine / width), wrappedLines.length - 1)
          : 0;
      const isAtLineEnd = safeCursor === lineEnd;
      const column =
        isAtLineEnd && width > 0
          ? line.length % width || Math.min(width, line.length)
          : offsetInLine;

      return {
        lineIndex: wrappedOffset + lineWrapIndex,
        column,
        lines: lines.length ? lines : [''],
      };
    }

    draftOffset = lineEnd + 1;
    wrappedOffset += wrappedLines.length;
  }

  return {
    lineIndex: Math.max(lines.length - 1, 0),
    column: lines[lines.length - 1]?.length ?? 0,
    lines: lines.length ? lines : [''],
  };
}

function renderVisibleLine(
  line: string,
  isCursorLine: boolean,
  cursorColumn: number,
): React.ReactNode {
  if (!isCursorLine) return line;
  const before = line.slice(0, cursorColumn);
  const after = line.slice(cursorColumn);
  return (
    <Text>
      {before}
      <Text color="ansi:cyan">▌</Text>
      {after}
    </Text>
  );
}

export function Composer({
  state,
  isStreaming,
  width,
  onInterceptInput,
}: {
  state: ComposerState;
  isStreaming: boolean;
  width: number;
  onInterceptInput?: (input: string, key: Key) => boolean;
}): React.JSX.Element {
  useInput(
    (input, key) => {
      if (onInterceptInput?.(input, key)) return;
      state.handleInput(input, key);
    },
    { isActive: true },
  );

  const lineMeta = useMemo(
    () => getComposerLayout(state.draft, state.cursor, width),
    [state.cursor, state.draft, width],
  );

  const visibleLines = useMemo(() => {
    return getComposerVisibleLines(state.draft, width);
  }, [state.draft, width]);

  const visibleStart = lineMeta.lines.length - visibleLines.length;
  const cursorVisibleIndex = lineMeta.lineIndex - visibleStart;

  const panelHeight = visibleLines.length + 5;

  return (
    <Panel
      title="Ask the engineer"
      tone="accent"
      boxProps={{ height: panelHeight, overflow: 'hidden' }}
    >
      <Box flexDirection="column">
        {visibleLines.map((line, index) => {
          const absoluteIndex = visibleStart + index;
          const isCursorLine = absoluteIndex === cursorVisibleIndex;
          const isEmptyDraft = state.draft.length === 0;
          const displayLine =
            isEmptyDraft && index === 0 ? (
              <Text color={theme.subtle}>
                Ask the engineer about pace, tyres, traffic, or strategy...
              </Text>
            ) : (
              renderVisibleLine(
                line,
                isCursorLine,
                isCursorLine ? lineMeta.column : 0,
              )
            );

          return (
            <Box key={`${index}-${line}`}>
              <Text color={theme.subtle}>{index === 0 ? '› ' : '  '}</Text>
              <Text wrap="truncate-end">{displayLine}</Text>
            </Box>
          );
        })}
        <Box>
          <Text color={theme.subtle}>
            enter send · shift+enter newline · tab details
            {isStreaming ? ' · streaming' : ''}
          </Text>
        </Box>
      </Box>
    </Panel>
  );
}
