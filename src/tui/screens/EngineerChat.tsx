import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useTerminalSize } from '#ink';
import type { Summary as SummaryData } from '../../core/summary.js';
import type { Meeting, Session } from '../../core/types.js';
import type { ChatMessage } from '../chat-state.js';
import type { Keybinding } from '../keybindings/actions.js';
import { Panel } from '../components/Panel.js';
import { useKeybindings } from '../keybindings/use-keybindings.js';
import { useTheme } from '../theme/provider.js';
import { Composer } from './engineer/Composer.js';
import { EngineerDetails } from './engineer/EngineerDetails.js';
import { EngineerSessionStrip } from './engineer/EngineerSessionStrip.js';
import { EngineerShell } from './engineer/EngineerShell.js';
import { EngineerStatusRow } from './engineer/EngineerStatusRow.js';
import {
  buildHistoricalTranscriptRows,
  buildLiveTranscriptRows,
} from './engineer/transcript-rows.js';
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

function getHistoricalTranscriptVersion(messages: ChatMessage[]): string {
  return messages
    .map(({ role, content }) => `${role}:${content}`)
    .join('\u0001');
}

function getTranscriptVersion({
  historicalTranscriptVersion,
  streamingText,
  isStreaming,
  status,
}: {
  historicalTranscriptVersion: string;
  streamingText: string;
  isStreaming: boolean;
  status: string | null;
}): string {
  const parts = historicalTranscriptVersion
    ? [historicalTranscriptVersion]
    : [];

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
  isActive: boolean;
  onSend: (text: string) => void;
  isStreaming: boolean;
  width: number;
};

const ComposerPanel = React.memo(function ComposerPanel({
  isActive,
  onSend,
  isStreaming,
  width,
}: ComposerPanelProps) {
  const state = useComposerState({ onSend, isStreaming });

  return <Composer isActive={isActive} state={state} width={width} />;
});

function EngineerLeaveConfirmation(): React.JSX.Element {
  const theme = useTheme();

  return (
    <Panel title="Leave engineer session?" tone="accent">
      <Text color={theme.text.primary}>
        Return to session selection. Your transcript is preserved.
      </Text>
      <Text color={theme.text.muted} dimColor>
        Enter leave · Esc stay
      </Text>
    </Panel>
  );
}

export function EngineerChat({
  messages,
  onSend,
  streamingText,
  isStreaming,
  status,
  year,
  meeting,
  session,
  activity,
  pythonCode,
  asOfLabel,
  idleStatus,
  leaveConfirmationOpen = false,
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
  idleStatus?: string | null;
  leaveConfirmationOpen?: boolean;
  maxHeight?: number;
  onConversationRender?: () => void;
  onRender?: () => void;
}) {
  const theme = useTheme();
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

  const hasUserTurn = useMemo(
    () => messages.some((message) => message.role === 'user'),
    [messages],
  );
  const historicalTranscriptRows = useMemo(
    () =>
      buildHistoricalTranscriptRows({
        messages,
        messageWidth: messageContentWidth,
        theme,
      }),
    [messageContentWidth, messages, theme],
  );
  const liveTranscriptRows = useMemo(
    () =>
      buildLiveTranscriptRows({
        hasUserTurn,
        streamingText,
        isStreaming,
        status,
        messageWidth: messageContentWidth,
        theme,
      }),
    [
      hasUserTurn,
      isStreaming,
      messageContentWidth,
      status,
      streamingText,
      theme,
    ],
  );
  const conversationRows = useMemo(
    () => [...historicalTranscriptRows, ...liveTranscriptRows],
    [historicalTranscriptRows, liveTranscriptRows],
  );
  const historicalTranscriptVersion = useMemo(
    () => getHistoricalTranscriptVersion(messages),
    [messages],
  );
  const transcriptVersion = useMemo(
    () =>
      getTranscriptVersion({
        historicalTranscriptVersion,
        streamingText,
        isStreaming,
        status,
      }),
    [historicalTranscriptVersion, isStreaming, status, streamingText],
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
  const displayedStatus =
    status ??
    (isStreaming ? activity.at(-1) : idleStatus) ??
    'Idle';
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
  const keybindings = useMemo<Keybinding[]>(
    () => [
      {
        action: 'transcript.pageUp',
        context: 'transcript',
        key: { pageUp: true },
        run: handlePageUp,
      },
      {
        action: 'transcript.pageDown',
        context: 'transcript',
        key: { pageDown: true },
        run: handlePageDown,
      },
      {
        action: 'transcript.wheelUp',
        context: 'transcript',
        key: { wheelUp: true },
        run: handleWheelUp,
      },
      {
        action: 'transcript.wheelDown',
        context: 'transcript',
        key: { wheelDown: true },
        run: handleWheelDown,
      },
      {
        action: 'engineer.toggleDetails',
        context: 'engineer',
        key: { tab: true },
        run: () => {
          setDetailsExpanded((current) => !current);
        },
      },
      {
        action: 'engineer.toggleDetails',
        context: 'engineer',
        key: { input: '\t' },
        run: () => {
          setDetailsExpanded((current) => !current);
        },
      },
    ],
    [handlePageDown, handlePageUp, handleWheelDown, handleWheelUp],
  );
  useKeybindings({
    activeContexts: ['engineer', 'transcript'],
    bindings: keybindings,
    isActive: !leaveConfirmationOpen,
  });

  return (
    <EngineerShell
      fullscreen={maxHeight === undefined}
      height={rows}
      top={<EngineerSessionStrip label={sessionStripLabel} />}
      modal={
        leaveConfirmationOpen ? <EngineerLeaveConfirmation /> : undefined
      }
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
          <EngineerStatusRow
            status={displayedStatus}
            isStreaming={isStreaming}
          />
          <ComposerPanel
            isActive={!leaveConfirmationOpen}
            onSend={onSend}
            isStreaming={isStreaming}
            width={composerContentWidth}
          />
        </Box>
      }
    />
  );
}
