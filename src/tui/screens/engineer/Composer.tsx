import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Panel } from '../../components/Panel.js';
import { theme } from '../../theme.js';
import {
  COMPOSER_VISIBLE_LINE_CAP,
  type ComposerState,
} from './useComposerState.js';

function getCursorLineMeta(draft: string, cursor: number): {
  lineIndex: number;
  column: number;
  lines: string[];
} {
  const lines = draft.length > 0 ? draft.split('\n') : [''];
  const safeCursor = Math.max(0, Math.min(cursor, draft.length));
  let offset = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const lineEnd = offset + line.length;
    if (safeCursor <= lineEnd) {
      return { lineIndex: i, column: safeCursor - offset, lines };
    }
    offset = lineEnd + 1;
  }

  return {
    lineIndex: lines.length - 1,
    column: lines[lines.length - 1]?.length ?? 0,
    lines,
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
      <Text color={theme.accent}>▌</Text>
      {after}
    </Text>
  );
}

export function Composer({
  state,
  isStreaming,
  height,
}: {
  state: ComposerState;
  isStreaming: boolean;
  height?: number;
}): React.JSX.Element {
  useInput(
    (input, key) => {
      state.handleInput(input, key);
    },
    { isActive: true },
  );

  const lineMeta = useMemo(
    () => getCursorLineMeta(state.draft, state.cursor),
    [state.cursor, state.draft],
  );

  const visibleLines = useMemo(() => {
    if (lineMeta.lines.length <= COMPOSER_VISIBLE_LINE_CAP) {
      return lineMeta.lines;
    }
    return lineMeta.lines.slice(-COMPOSER_VISIBLE_LINE_CAP);
  }, [lineMeta.lines]);

  const visibleStart = lineMeta.lines.length - visibleLines.length;
  const cursorVisibleIndex = lineMeta.lineIndex - visibleStart;

  const contentHeight = visibleLines.length + 1;
  const panelHeight = height ?? contentHeight + 4;

  return (
    <Panel
      title="Ask the engineer"
      tone="muted"
      boxProps={{ height: panelHeight, overflow: 'hidden' }}
    >
      <Box flexDirection="column">
        {visibleLines.map((line, index) => {
          const isCursorLine = index === cursorVisibleIndex;
          const isEmptyDraft = state.draft.length === 0;
          const displayLine = isEmptyDraft
            ? <Text color={theme.muted}>Ask about pace, gaps, tyres...</Text>
            : renderVisibleLine(
                line,
                isCursorLine,
                isCursorLine ? lineMeta.column : 0,
              );

          return (
            <Box key={`${index}-${line}`}>
              <Text color={theme.muted}>{index === 0 ? '› ' : '  '}</Text>
              <Text wrap="truncate-end">{displayLine}</Text>
            </Box>
          );
        })}
        <Box>
          <Text color={theme.muted}>
            enter send · shift+enter newline
            {isStreaming ? ' · streaming' : ''}
          </Text>
        </Box>
      </Box>
    </Panel>
  );
}
