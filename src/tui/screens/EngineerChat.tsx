import React, { useEffect, useMemo, useState } from 'react';
import { Box, type Key, useStdout } from 'ink';
import type { Summary as SummaryData } from '../../core/summary.js';
import type { Meeting, Session } from '../../core/types.js';
import type { ChatMessage } from '../chat-state.js';
import { Composer } from './engineer/Composer.js';
import {
  EngineerDetails,
  getEngineerDetailsHeight,
} from './engineer/EngineerDetails.js';
import {
  buildTranscriptRows,
  type TranscriptRow,
} from './engineer/transcript-rows.js';
import { TranscriptViewport } from './engineer/TranscriptViewport.js';
import { useComposerState } from './engineer/useComposerState.js';
import { useTranscriptViewport } from './engineer/useTranscriptViewport.js';

type ConversationRow = TranscriptRow;

type ComposerPanelProps = {
  onSend: (text: string) => void;
  isStreaming: boolean;
  width: number;
  onHeightChange: (visibleLineCount: number) => void;
  onInterceptInput?: (input: string, key: Key) => boolean;
};

const ComposerPanel = React.memo(function ComposerPanel({
  onSend,
  isStreaming,
  width,
  onHeightChange,
  onInterceptInput,
}: ComposerPanelProps) {
  const state = useComposerState({ onSend, isStreaming });

  return (
    <Composer
      state={state}
      isStreaming={isStreaming}
      width={width}
      onHeightChange={onHeightChange}
      onInterceptInput={onInterceptInput}
    />
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
  const messageContentWidth = Math.max(10, columns - 2);
  const composerContentWidth = Math.max(12, columns - 4);
  const [composerVisibleLines, setComposerVisibleLines] = useState(1);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  useEffect(() => {
    onRender?.();
  });

  const inputPanelHeight = composerVisibleLines + 5;
  const sectionGap = compact ? 0 : 1;
  const detailsHeight = getEngineerDetailsHeight({
    isExpanded: detailsExpanded,
    activity,
    pythonCode: pythonCode ?? '',
  });
  const availableForTranscript =
    rows - inputPanelHeight - detailsHeight - sectionGap * 2;
  const transcriptHeight = Math.max(availableForTranscript, 1);

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
      conversationRows
        .map((row) => `${row.kind}:${row.plainText}`)
        .join('\u0001'),
    [conversationRows],
  );
  const { window, scrollHint } = useTranscriptViewport({
    rowCount: conversationRows.length,
    transcriptHeight,
    transcriptVersion,
  });

  const visibleRows = useMemo(
    () => conversationRows.slice(window.start, window.end),
    [conversationRows, window.end, window.start],
  );

  const activityEntries = useMemo(
    () => (activity.length ? activity : status ? [status] : ['Idle']),
    [activity, status],
  );
  const handleComposerIntercept = (input: string, key: Key) => {
    if (key.tab || input === '\t') {
      setDetailsExpanded((current) => !current);
      return true;
    }
    return false;
  };

  return (
    <Box flexDirection="column" gap={sectionGap} height={rows}>
      <Box
        flexDirection="column"
        flexGrow={1}
        height={transcriptHeight}
        overflow="hidden"
      >
        <TranscriptViewport
          visibleRows={visibleRows}
          scrollHint={scrollHint}
          height={transcriptHeight}
          onRender={onConversationRender}
        />
      </Box>
      <EngineerDetails
        year={year}
        meetingName={meeting.Name}
        sessionName={session.Name}
        sessionType={session.Type}
        summary={summary}
        asOfLabel={asOfLabel ?? null}
        activity={activityEntries}
        pythonCode={pythonCode ?? ''}
        isExpanded={detailsExpanded}
      />
      <ComposerPanel
        onSend={onSend}
        isStreaming={isStreaming}
        width={composerContentWidth}
        onHeightChange={setComposerVisibleLines}
        onInterceptInput={handleComposerIntercept}
      />
    </Box>
  );
}
