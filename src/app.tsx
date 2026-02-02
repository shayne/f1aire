import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { openai } from '@ai-sdk/openai';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, useInput, useStdout } from 'ink';
import { createEngineerLogger } from './agent/engineer-logger.js';
import { createEngineerSession } from './agent/engineer.js';
import { formatUnknownError } from './agent/error-utils.js';
import { systemPrompt } from './agent/prompt.js';
import { makeTools } from './agent/tools.js';
import { downloadSession } from './core/download.js';
import { getMeetings } from './core/f1-api.js';
import { summarizeFromLines, type Summary as SummaryData } from './core/summary.js';
import { loadSessionStore } from './core/session-store.js';
import { TimingService } from './core/timing-service.js';
import type { TimeCursor } from './core/time-cursor.js';
import { getDataDir } from './core/xdg.js';
import { appendUserMessage, type ChatMessage } from './tui/chat-state.js';
import { FooterHints } from './tui/components/FooterHints.js';
import { Header } from './tui/components/Header.js';
import { getBackScreen, type Screen } from './tui/navigation.js';
import { startEventLoopLagMonitor } from './tui/perf.js';
import { Downloading } from './tui/screens/Downloading.js';
import { EngineerChat } from './tui/screens/EngineerChat.js';
import { MeetingPicker } from './tui/screens/MeetingPicker.js';
import { SeasonPicker } from './tui/screens/SeasonPicker.js';
import { SessionPicker } from './tui/screens/SessionPicker.js';
import { Summary } from './tui/screens/Summary.js';

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: 'season' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeCursor, setTimeCursor] = useState<TimeCursor>({ latest: true });
  const engineerRef = useRef<ReturnType<typeof createEngineerSession> | null>(null);
  const engineerLoggerRef = useRef<ReturnType<typeof createEngineerLogger> | null>(
    null,
  );
  const perfStopRef = useRef<(() => void) | null>(null);
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 40;
  const isShort = terminalRows < 32;
  if (!engineerLoggerRef.current) {
    engineerLoggerRef.current = createEngineerLogger({
      dataDir: getDataDir('f1aire'),
    });
  }

  useEffect(() => {
    perfStopRef.current?.();
    perfStopRef.current = null;
    if (screen.name !== 'engineer') return;
    perfStopRef.current = startEventLoopLagMonitor({
      logger: engineerLoggerRef.current?.logger ?? undefined,
      intervalMs: 100,
      warnMs: 150,
    });
    return () => {
      perfStopRef.current?.();
      perfStopRef.current = null;
    };
  }, [screen.name]);
  const pushActivity = (entry: string) => {
    setActivity((prev) => {
      if (prev[prev.length - 1] === entry) return prev;
      const next = [...prev, entry];
      return next.slice(-6);
    });
  };
  const handleSend = async (text: string) => {
    if (isStreaming) return;
    const session = engineerRef.current;
    if (!session) return;
    setIsStreaming(true);
    setStreamStatus('Thinking...');
    setActivity(['Thinking...']);
    setMessages((prev) => appendUserMessage(prev, text));
    let buffer = '';
    setStreamingText('');
    try {
      for await (const chunk of session.send(text)) {
        buffer += chunk;
        setStreamingText(buffer);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: buffer }]);
    } catch (err) {
      const message = formatUnknownError(err);
      pushActivity(`Error: ${message}`);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${message}` },
      ]);
    } finally {
      setStreamingText('');
      setIsStreaming(false);
      setStreamStatus(null);
    }
  };
  const breadcrumb = useMemo(() => {
    if (screen.name === 'season') return ['Season'];
    if (screen.name === 'meeting') return [`${screen.year}`, 'Meeting'];
    if (screen.name === 'session') {
      return [`${screen.year}`, screen.meeting.Name, 'Session'];
    }
    if (screen.name === 'downloading') {
      return [
        `${screen.year}`,
        screen.meeting.Name,
        screen.session.Name,
        'Download',
      ];
    }
    if (screen.name === 'engineer') {
      return [
        `${screen.year}`,
        screen.meeting.Name,
        screen.session.Name,
        'Engineer',
      ];
    }
    if (screen.name === 'summary') return ['Summary'];
    return ['F1aire'];
  }, [screen]);

  useInput((input, key) => {
    if (screen.name === 'engineer') {
      if (key.escape) {
        const next = getBackScreen(screen);
        if (next) setScreen(next);
      }
      if (key.ctrl && input === 'c') process.exit(0);
      return;
    }
    if (input === 'q') process.exit(0);
    if (input === 'b' || key.backspace || key.escape) {
      const next = getBackScreen(screen);
      if (next) setScreen(next);
    }
  });

  const headerRows = breadcrumb.length ? (isShort ? 4 : 6) : isShort ? 3 : 4;
  const footerRows = 1;
  const contentHeight = Math.max(terminalRows - headerRows - footerRows, 10);
  const asOfLabel = timeCursor?.latest
    ? 'Latest'
    : Number.isFinite(timeCursor?.lap)
      ? `Lap ${timeCursor.lap}`
      : timeCursor?.iso
        ? `Time ${timeCursor.iso}`
        : 'Latest';

  return (
    <Box flexDirection="column" height={terminalRows}>
      <Header breadcrumb={breadcrumb} compact={isShort} />
      <Box flexGrow={1} flexDirection="column" marginLeft={1} height={contentHeight}>
        {screen.name === 'season' && (
          <SeasonPicker
            onSelect={async (year) => {
              const data = await getMeetings(year);
              setScreen({ name: 'meeting', year, meetings: data.Meetings });
            }}
          />
        )}
        {screen.name === 'meeting' && (
          <MeetingPicker
            year={screen.year}
            meetings={screen.meetings}
            onSelect={(meeting) =>
              setScreen({
                name: 'session',
                year: screen.year,
                meetings: screen.meetings,
                meeting,
              })
            }
          />
        )}
        {screen.name === 'session' && (
          <SessionPicker
            meeting={screen.meeting}
            onSelect={(session) =>
              setScreen({
                name: 'downloading',
                year: screen.year,
                meetings: screen.meetings,
                meeting: screen.meeting,
                session,
              })
            }
          />
        )}
        {screen.name === 'downloading' && (
          <Downloading
            meeting={screen.meeting}
            session={screen.session}
            onComplete={(dir) => {
              void (async () => {
                const livePath = path.join(dir, 'live.jsonl');
                const lines = fs.readFileSync(livePath, 'utf-8');
                const summary = summarizeFromLines(lines);
                const summaryText = [
                  'Quick summary:',
                  summary.winner
                    ? `Winner: ${summary.winner.name} (#${summary.winner.number})`
                    : 'Winner: unavailable',
                  summary.fastestLap
                    ? `Fastest lap: ${summary.fastestLap.name} (#${summary.fastestLap.number}) ${summary.fastestLap.time}`
                    : 'Fastest lap: unavailable',
                  summary.totalLaps
                    ? `Total laps: ${summary.totalLaps}`
                    : 'Total laps: unavailable',
                ].join('\n');
                setSummary(summary);
                const loadStart = performance.now();
                const store = await loadSessionStore(dir);
                const loadDurationMs = performance.now() - loadStart;
                void engineerLoggerRef.current?.logger({
                  type: 'load-session-store',
                  durationMs: Math.round(loadDurationMs),
                  livePoints: store.raw.live.length,
                });
                const timingService = new TimingService();
                const subscribe = store.raw.subscribe ?? {};
                const processStart = performance.now();
                for (const [type, json] of Object.entries(subscribe)) {
                  timingService.enqueue({
                    type,
                    json,
                    dateTime: new Date(),
                  });
                }
                for (const point of store.raw.live) timingService.enqueue(point);
                const processDurationMs = performance.now() - processStart;
                void engineerLoggerRef.current?.logger({
                  type: 'timing-process',
                  durationMs: Math.round(processDurationMs),
                  livePoints: store.raw.live.length,
                });
                const initialTimeCursor: TimeCursor = { latest: true };
                setTimeCursor(initialTimeCursor);
                const tools = makeTools({
                  store,
                  processors: timingService.processors,
                  timeCursor: initialTimeCursor,
                  onTimeCursorChange: setTimeCursor,
                });
                const modelId =
                  process.env.OPENAI_API_MODEL ?? 'gpt-5.2-codex';
                const model = openai(modelId);
                void engineerLoggerRef.current?.logger({
                  type: 'engineer-init',
                  modelId,
                  apiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
                  session: screen.session.Name,
                  meeting: screen.meeting.Name,
                });
                engineerRef.current = createEngineerSession({
                  model,
                  tools,
                  system: systemPrompt,
                  logger: engineerLoggerRef.current?.logger ?? undefined,
                  onEvent: (event) => {
                    if (event.type === 'send-start') {
                      setStreamStatus('Thinking...');
                      pushActivity('Thinking...');
                      return;
                    }
                    if (event.type === 'send-finish') {
                      setStreamStatus(null);
                      pushActivity('Response ready');
                      return;
                    }
                    if (event.type === 'stream-error') {
                      const msg = typeof event.error === 'string' ? event.error : 'error';
                      setStreamStatus(`Error: ${msg}`);
                      pushActivity(`Error: ${msg}`);
                      return;
                    }
                    if (event.type !== 'stream-part') return;
                    const part = event.part as Record<string, unknown> | undefined;
                    const partType = part?.type as string | undefined;
                    if (!partType) return;
                    if (partType === 'text-delta') {
                      setStreamStatus(null);
                      pushActivity('Streaming response');
                      return;
                    }
                    if (partType === 'reasoning-start' || partType === 'start-step') {
                      setStreamStatus('Thinking...');
                      pushActivity('Thinking...');
                      return;
                    }
                    if (partType === 'tool-input-start') {
                      setStreamStatus('Preparing tool call...');
                      pushActivity('Preparing tool call');
                      return;
                    }
                    if (partType === 'tool-call') {
                      const toolName =
                        (part as any).toolName ??
                        (part as any).tool?.name ??
                        (part as any).toolCall?.name ??
                        'tool';
                      setStreamStatus(`Running tool: ${toolName}`);
                      pushActivity(`Running tool: ${toolName}`);
                      return;
                    }
                    if (partType === 'tool-result') {
                      const toolName =
                        (part as any).toolName ??
                        (part as any).tool?.name ??
                        (part as any).toolCall?.name ??
                        'tool';
                      setStreamStatus(`Processing result: ${toolName}`);
                      pushActivity(`Processing result: ${toolName}`);
                    }
                  },
                });
                setActivity([]);
                setMessages([{ role: 'assistant', content: summaryText }]);
                setStreamingText('');
                setScreen({
                  name: 'engineer',
                  year: screen.year,
                  meetings: screen.meetings,
                  meeting: screen.meeting,
                  session: screen.session,
                  dir,
                });
              })();
            }}
            onStart={async () => {
              const root = getDataDir('f1aire');
              const result = await downloadSession({
                year: screen.year,
                meeting: screen.meeting,
                sessionKey: screen.session.Key,
                dataRoot: root,
                allowExisting: true,
              });
              return result.dir;
            }}
          />
        )}
        {screen.name === 'engineer' && (
          <EngineerChat
            messages={messages}
            streamingText={streamingText}
            onSend={handleSend}
            isStreaming={isStreaming}
            status={streamStatus}
            year={screen.year}
            meeting={screen.meeting}
            session={screen.session}
            summary={summary}
            activity={activity}
            maxHeight={contentHeight}
            asOfLabel={asOfLabel}
          />
        )}
        {screen.name === 'summary' && (
          <Summary summary={screen.summary} dir={screen.dir} />
        )}
      </Box>
      <FooterHints screen={screen.name} />
    </Box>
  );
}
