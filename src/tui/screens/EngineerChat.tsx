import React, { useEffect, useMemo, useState } from 'react';
import { Box, type Key, useTerminalSize } from '#ink';
import type { Summary as SummaryData } from '../../core/summary.js';
import type { Meeting, Session } from '../../core/types.js';
import type { ChatMessage } from '../chat-state.js';
import { Composer } from './engineer/Composer.js';
import { EngineerDetails } from './engineer/EngineerDetails.js';
import { EngineerSessionStrip } from './engineer/EngineerSessionStrip.js';
import { EngineerShell } from './engineer/EngineerShell.js';
import { EngineerStatusRow } from './engineer/EngineerStatusRow.js';
import { buildTranscriptRows } from './engineer/transcript-rows.js';
import { TranscriptViewport } from './engineer/TranscriptViewport.js';
import { useEngineerScrollState } from './engineer/useEngineerScrollState.js';
import { useComposerState } from './engineer/useComposerState.js';
import { useVirtualTranscriptRows } from './engineer/useVirtualTranscriptRows.js';

function getSessionStripLabel({
  year,
  meeting,
  session,
  asOfLabel,
  latestActivity,
}: {
  year: number;
  meeting: Meeting;
  session: Session;
  asOfLabel: string | null | undefined;
  latestActivity: string;
}): string {
  return [
    `${year} ${meeting.Name}`,
    session.Name,
    asOfLabel ?? latestActivity,
  ].join(' · ');
}

function getTranscriptVersion({
  messages,
  streamingText,
  isStreaming,
  status,
}: {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  status: string | null;
}): string {
  const parts = messages.map(({ role, content }) => `${role}:${content}`);

  if (isStreaming) {
    if (streamingText) {
      parts.push(`stream:${streamingText}`);
    } else if (status) {
      parts.push(`pending:${status}`);
    }
  }

  return parts.join('\u0001');
}

type ComposerPanelProps = {
  onSend: (text: string) => void;
  isStreaming: boolean;
  width: number;
  onInterceptInput?: (input: string, key: Key) => boolean;
};

const ComposerPanel = React.memo(function ComposerPanel({
  onSend,
  isStreaming,
  width,
  onInterceptInput,
}: ComposerPanelProps) {
  const state = useComposerState({ onSend, isStreaming });

  return (
    <Composer state={state} width={width} onInterceptInput={onInterceptInput} />
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
  const { columns = 100, rows: terminalRows = 40 } = useTerminalSize();
  const rows = maxHeight ?? terminalRows;
  const compact = rows < 32;
  const messageContentWidth = Math.max(10, columns - 2);
  const composerContentWidth = Math.max(12, columns - 4);
  const [detailsExpanded, setDetailsExpanded] = useState(() => !compact);

  useEffect(() => {
    if (compact) {
      setDetailsExpanded(false);
    }
  }, [compact]);

  useEffect(() => {
    onRender?.();
  });

  const sectionGap = compact ? 0 : 1;

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

  const transcriptVersion = useMemo(
    () =>
      getTranscriptVersion({
        messages,
        streamingText,
        isStreaming,
        status,
      }),
    [isStreaming, messages, status, streamingText],
  );
  const {
    scrollRef,
    dividerYRef,
    scrollOffset,
    viewportRows,
    scrollHint,
    newMessageCount,
    jumpToLatest,
    handlePageUp,
    handlePageDown,
    handleWheelUp,
    handleWheelDown,
  } = useEngineerScrollState({
    estimatedViewportRows: rows,
    messageCount: messages.length,
    rowCount: conversationRows.length,
    transcriptVersion,
  });
  const { visibleRows, topSpacerRows, bottomSpacerRows } =
    useVirtualTranscriptRows({
      rows: conversationRows,
      viewportRows,
      scrollOffset,
    });

  const detailsActivity = useMemo(
    () => (isStreaming ? activity.slice(0, -1) : activity),
    [activity, isStreaming],
  );
  const liveStatus = status ?? (isStreaming ? activity.at(-1) : null) ?? 'Idle';
  const sessionStripLabel = useMemo(
    () =>
      getSessionStripLabel({
        year,
        meeting,
        session,
        asOfLabel,
        latestActivity: liveStatus,
      }),
    [asOfLabel, liveStatus, meeting, session, year],
  );
  const handleComposerIntercept = (input: string, key: Key) => {
    if (key.pageUp) {
      return handlePageUp();
    }

    if (key.pageDown) {
      return handlePageDown();
    }

    if (key.wheelUp) {
      return handleWheelUp();
    }

    if (key.wheelDown) {
      return handleWheelDown();
    }

    if (key.tab || input === '\t') {
      setDetailsExpanded((current) => !current);
      return true;
    }
    return false;
  };

  return (
    <EngineerShell
      fullscreen={maxHeight === undefined}
      height={rows}
      top={<EngineerSessionStrip label={sessionStripLabel} />}
      scrollRef={scrollRef}
      dividerYRef={dividerYRef}
      newMessageCount={newMessageCount}
      onPillClick={jumpToLatest}
      scrollable={
        <TranscriptViewport
          rows={visibleRows}
          topSpacerRows={topSpacerRows}
          bottomSpacerRows={bottomSpacerRows}
          scrollHint={scrollHint}
          onScrollHintClick={jumpToLatest}
          onRender={onConversationRender}
        />
      }
      bottom={
        <Box flexDirection="column" gap={sectionGap}>
          <EngineerDetails
            activity={detailsActivity}
            pythonCode={pythonCode ?? ''}
            isExpanded={detailsExpanded}
          />
          <EngineerStatusRow status={liveStatus} isStreaming={isStreaming} />
          <ComposerPanel
            onSend={onSend}
            isStreaming={isStreaming}
            width={composerContentWidth}
            onInterceptInput={handleComposerIntercept}
          />
        </Box>
      }
    />
  );
}
