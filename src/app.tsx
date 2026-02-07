import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createOpenAI } from '@ai-sdk/openai';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, useInput, useStdout } from 'ink';
import { createEngineerLogger } from './agent/engineer-logger.js';
import { createEngineerSession } from './agent/engineer.js';
import { formatUnknownError } from './agent/error-utils.js';
import { ensurePyodideAssets } from './agent/pyodide/assets.js';
import { PYODIDE_VERSION } from './agent/pyodide/paths.js';
import { systemPrompt } from './agent/prompt.js';
import { makeTools } from './agent/tools.js';
import {
  clearStoredOpenAIApiKey,
  getAppConfigPath,
  readAppConfig,
  writeOpenAIApiKey,
} from './core/config.js';
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
import { ApiKeyPrompt } from './tui/screens/ApiKeyPrompt.js';
import { RuntimePreparing } from './tui/screens/RuntimePreparing.js';
import { SeasonPicker } from './tui/screens/SeasonPicker.js';
import { SessionPicker } from './tui/screens/SessionPicker.js';
import { Settings, type SettingsAction } from './tui/screens/Settings.js';
import { Summary } from './tui/screens/Summary.js';

type ToolTimingEntry = {
  toolName: string;
  toolCallId?: string;
  inputBytes?: number;
  inputStart?: number;
  callStart?: number;
};

type ToolPart = Record<string, unknown>;

type RuntimeProgress = {
  phase: 'downloading' | 'extracting' | 'ready';
  downloadedBytes?: number;
  totalBytes?: number;
};

type RuntimeProgressUpdate = RuntimeProgress & { message: string };

type DownloadScreen = Extract<Screen, { name: 'downloading' }>;

type PendingEngineer = Omit<DownloadScreen, 'name'> & { dir: string };

function tryExtractJsonStringField(value: string, fieldName: string): string | null {
  const key = `"${fieldName}"`;
  const keyIndex = value.indexOf(key);
  if (keyIndex < 0) return null;
  const colonIndex = value.indexOf(':', keyIndex + key.length);
  if (colonIndex < 0) return null;
  let i = colonIndex + 1;
  while (i < value.length && /\s/.test(value[i] ?? '')) i += 1;
  if (value[i] !== '"') return null;
  i += 1;
  let out = '';
  while (i < value.length) {
    const ch = value[i]!;
    if (ch === '"') return out;
    if (ch === '\\') {
      const next = value[i + 1];
      if (next === undefined) return out;
      if (next === 'n') {
        out += '\n';
        i += 2;
        continue;
      }
      if (next === 'r') {
        out += '\r';
        i += 2;
        continue;
      }
      if (next === 't') {
        out += '\t';
        i += 2;
        continue;
      }
      if (next === '\\' || next === '"' || next === '/') {
        out += next;
        i += 2;
        continue;
      }
      if (next === 'u' && i + 5 < value.length) {
        const hex = value.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          continue;
        }
      }
      out += next;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const getToolName = (part: ToolPart): string =>
  ((part as any).toolName ??
    (part as any).tool?.name ??
    (part as any).toolCall?.name ??
    'tool') as string;

const getToolCallId = (part: ToolPart): string | undefined => {
  const id =
    (part as any).toolCallId ??
    (part as any).toolCall?.id ??
    (part as any).id;
  return typeof id === 'string' ? id : undefined;
};

const getToolInputBytes = (part: ToolPart): number | undefined => {
  const input =
    (part as any).args ??
    (part as any).input ??
    (part as any).toolCall?.args ??
    (part as any).tool?.args ??
    (part as any).toolInput;
  if (input == null) return undefined;
  if (typeof input === 'string') return Buffer.byteLength(input, 'utf-8');
  try {
    return Buffer.byteLength(JSON.stringify(input), 'utf-8');
  } catch {
    return undefined;
  }
};

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: 'season' });
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState(
    'Checking Python runtime...',
  );
  const [runtimeProgress, setRuntimeProgress] = useState<RuntimeProgress | null>(
    null,
  );
  const [storedApiKey, setStoredApiKey] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [pythonCodePreview, setPythonCodePreview] = useState('');
  const [pythonCodeTarget, setPythonCodeTarget] = useState('');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeCursor, setTimeCursor] = useState<TimeCursor>({ latest: true });
  const engineerRef = useRef<ReturnType<typeof createEngineerSession> | null>(null);
  const pendingEngineerRef = useRef<PendingEngineer | null>(null);
  const engineerLoggerRef = useRef<ReturnType<typeof createEngineerLogger> | null>(
    null,
  );
  const toolTimingRef = useRef({
    byId: new Map<string, ToolTimingEntry>(),
    inputQueue: [] as ToolTimingEntry[],
    callQueue: [] as ToolTimingEntry[],
  });
  const toolInputPreviewRef = useRef(new Map<string, string>());
  const perfStopRef = useRef<(() => void) | null>(null);
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 40;
  const isShort = terminalRows < 32;
  const configPath = useMemo(() => getAppConfigPath('f1aire'), []);
  const envApiKey =
    typeof process.env.OPENAI_API_KEY === 'string' &&
    process.env.OPENAI_API_KEY.trim().length > 0
      ? process.env.OPENAI_API_KEY.trim()
      : null;
  const effectiveApiKey = envApiKey ?? storedApiKey;
  const keyStatus = useMemo(() => {
    const inUse: 'env' | 'stored' | 'none' = envApiKey
      ? 'env'
      : storedApiKey
        ? 'stored'
        : 'none';
    return {
      envKeyPresent: Boolean(envApiKey),
      storedKeyPresent: Boolean(storedApiKey),
      inUse,
    };
  }, [envApiKey, storedApiKey]);
  if (!engineerLoggerRef.current) {
    engineerLoggerRef.current = createEngineerLogger({
      dataDir: getDataDir('f1aire'),
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await readAppConfig('f1aire');
        if (cancelled) return;
        const key =
          typeof cfg.openaiApiKey === 'string' && cfg.openaiApiKey.trim().length > 0
            ? cfg.openaiApiKey.trim()
            : null;
        setStoredApiKey(key);
      } catch {
        if (!cancelled) setStoredApiKey(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setPythonCodePreview((prev) => {
        if (prev === pythonCodeTarget) return prev;
        if (!pythonCodeTarget.startsWith(prev)) return pythonCodeTarget;
        const remaining = pythonCodeTarget.slice(prev.length);
        const newlineIndex = remaining.indexOf('\n');
        const advance = Math.max(
          1,
          Math.min(
            newlineIndex >= 0 ? newlineIndex + 1 : remaining.length,
            240,
          ),
        );
        return pythonCodeTarget.slice(0, prev.length + advance);
      });
    }, 35);
    return () => clearInterval(timer);
  }, [pythonCodeTarget]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setRuntimeMessage('Preparing Python runtime...');
        const reportProgress = (update: RuntimeProgressUpdate) => {
          if (cancelled) return;
          setRuntimeMessage(update.message);
          setRuntimeProgress({
            phase: update.phase,
            downloadedBytes: update.downloadedBytes,
            totalBytes: update.totalBytes,
          });
        };
        await ensurePyodideAssets({
          version: PYODIDE_VERSION,
          onProgress: reportProgress,
        });
        if (!cancelled) setRuntimeReady(true);
      } catch (err) {
        if (!cancelled) {
          setRuntimeProgress(null);
          setRuntimeMessage(
            `Python runtime failed: ${formatUnknownError(err)}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const resolveApiKeyForUse = async (): Promise<string | null> => {
    const fromEnv =
      typeof process.env.OPENAI_API_KEY === 'string' &&
      process.env.OPENAI_API_KEY.trim().length > 0
        ? process.env.OPENAI_API_KEY.trim()
        : null;
    if (fromEnv) return fromEnv;
    if (storedApiKey) return storedApiKey;
    try {
      const cfg = await readAppConfig('f1aire');
      const key =
        typeof cfg.openaiApiKey === 'string' && cfg.openaiApiKey.trim().length > 0
          ? cfg.openaiApiKey.trim()
          : null;
      if (key) setStoredApiKey(key);
      return key;
    } catch {
      return null;
    }
  };

  const startEngineer = async (pending: PendingEngineer, apiKey: string) => {
    const livePath = path.join(pending.dir, 'live.jsonl');
    const lines = fs.readFileSync(livePath, 'utf-8');
    const computedSummary = summarizeFromLines(lines);
    const summaryText = [
      'Quick summary:',
      computedSummary.winner
        ? `Winner: ${computedSummary.winner.name} (#${computedSummary.winner.number})`
        : 'Winner: unavailable',
      computedSummary.fastestLap
        ? `Fastest lap: ${computedSummary.fastestLap.name} (#${computedSummary.fastestLap.number}) ${computedSummary.fastestLap.time}`
        : 'Fastest lap: unavailable',
      computedSummary.totalLaps
        ? `Total laps: ${computedSummary.totalLaps}`
        : 'Total laps: unavailable',
    ].join('\n');
    setSummary(computedSummary);
    const loadStart = performance.now();
    const store = await loadSessionStore(pending.dir);
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
      logger: engineerLoggerRef.current?.logger ?? undefined,
    });
    const modelId = process.env.OPENAI_API_MODEL ?? 'gpt-5.2-codex';
    const keyToUse = await resolveApiKeyForUse();
    const provider = createOpenAI({
      apiKey: keyToUse ?? apiKey,
    });
    const model = provider(modelId);
    void engineerLoggerRef.current?.logger({
      type: 'engineer-init',
      modelId,
      envKeyPresent: Boolean(process.env.OPENAI_API_KEY),
      storedKeyPresent: Boolean(storedApiKey),
      effectiveKeySource: keyStatus.inUse,
      session: pending.session.Name,
      meeting: pending.meeting.Name,
    });
    engineerRef.current = createEngineerSession({
      model,
      tools,
      system: systemPrompt,
      logger: engineerLoggerRef.current?.logger ?? undefined,
      onEvent: (event) => {
        if (event.type === 'send-start') {
          const toolTiming = toolTimingRef.current;
          toolTiming.byId.clear();
          toolTiming.inputQueue.length = 0;
          toolTiming.callQueue.length = 0;
          toolInputPreviewRef.current.clear();
          setPythonCodePreview('');
          setPythonCodeTarget('');
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
          const msg =
            typeof event.error === 'string' ? event.error : 'error';
          setStreamStatus(`Error: ${msg}`);
          pushActivity(`Error: ${msg}`);
          return;
        }
        if (event.type !== 'stream-part') return;
        const part = event.part as ToolPart | undefined;
        if (!part) return;
        const partType = part.type as string | undefined;
        if (!partType) return;
        if (partType === 'text-delta') {
          setStreamStatus(null);
          pushActivity('Streaming response');
          return;
        }
        if (
          partType === 'reasoning-start' ||
          partType === 'start-step'
        ) {
          setStreamStatus('Thinking...');
          pushActivity('Thinking...');
          return;
        }
        if (partType === 'tool-input-start') {
          const toolName = getToolName(part);
          const toolCallId = getToolCallId(part);
          const inputBytes = getToolInputBytes(part);
          const toolTiming = toolTimingRef.current;
          const inputStart = performance.now();
          if (toolCallId) {
            toolTiming.byId.set(toolCallId, {
              toolName,
              toolCallId,
              inputBytes,
              inputStart,
            });
          } else {
            toolTiming.inputQueue.push({
              toolName,
              inputBytes,
              inputStart,
            });
          }
          if (toolName === 'run_py') {
            setStreamStatus('Writing code...');
            pushActivity('Writing code');
          }
          if (toolCallId) {
            toolInputPreviewRef.current.set(toolCallId, '');
            if (toolName === 'run_py') {
              setPythonCodePreview('');
              setPythonCodeTarget('');
            }
          }
          return;
        }
        if (partType === 'tool-input-delta') {
          const toolCallId = getToolCallId(part);
          const delta =
            typeof (part as any)?.inputTextDelta === 'string'
              ? ((part as any).inputTextDelta as string)
              : typeof (part as any)?.delta === 'string'
                ? ((part as any).delta as string)
                : undefined;
          if (typeof toolCallId !== 'string' || typeof delta !== 'string') return;
          const previous =
            toolInputPreviewRef.current.get(toolCallId) ?? '';
          const next = previous + delta;
          toolInputPreviewRef.current.set(toolCallId, next);
          const toolName =
            toolTimingRef.current.byId.get(toolCallId)?.toolName ??
            toolTimingRef.current.inputQueue.find((e) => e.toolCallId === toolCallId)
              ?.toolName;
          if (toolName === 'run_py') {
            const extracted = tryExtractJsonStringField(next, 'code');
            if (extracted != null) setPythonCodeTarget(extracted);
          }
          return;
        }
        if (partType === 'tool-input-available') {
          const toolName = getToolName(part);
          if (toolName === 'run_py') {
            const input = (part as any)?.input;
            if (input && typeof input === 'object' && typeof input.code === 'string') {
              setPythonCodeTarget(input.code);
            }
          }
          return;
        }
        if (partType === 'tool-call') {
          const toolName = getToolName(part);
          const toolCallId = getToolCallId(part);
          const inputBytes = getToolInputBytes(part);
          const toolTiming = toolTimingRef.current;
          const callStart = performance.now();
          if (toolCallId) {
            const entry = toolTiming.byId.get(toolCallId);
            if (entry) {
              entry.callStart = callStart;
              if (inputBytes != null) entry.inputBytes = inputBytes;
            } else {
              toolTiming.byId.set(toolCallId, {
                toolName,
                toolCallId,
                inputBytes,
                callStart,
              });
            }
          } else {
            const nextEntry = toolTiming.inputQueue.shift();
            if (nextEntry) {
              nextEntry.callStart = callStart;
              if (inputBytes != null) nextEntry.inputBytes = inputBytes;
              toolTiming.callQueue.push(nextEntry);
            }
          }
          if (toolName === 'run_py') {
            const args =
              (part as any).args ??
              (part as any).input ??
              (part as any).toolCall?.args ??
              (part as any).tool?.args ??
              (part as any).toolInput;
            if (args && typeof args === 'object' && typeof args.code === 'string') {
              setPythonCodeTarget(args.code);
            }
          }
          setStreamStatus(`Running tool: ${toolName}`);
          pushActivity(`Running tool: ${toolName}`);
          return;
        }
        if (partType === 'tool-result') {
          const toolName = getToolName(part);
          const toolCallId = getToolCallId(part);
          const toolTiming = toolTimingRef.current;
          let entry: ToolTimingEntry | undefined =
            toolCallId ? toolTiming.byId.get(toolCallId) : undefined;
          if (!entry && toolTiming.callQueue.length > 0) {
            entry = toolTiming.callQueue.shift();
          }
          const executionEvent: Record<string, unknown> = {
            type: 'tool-timing',
            phase: 'execution',
            toolName,
            toolCallId,
          };
          if (entry?.callStart != null) {
            executionEvent.durationMs = Math.round(
              performance.now() - entry.callStart,
            );
          }
          void engineerLoggerRef.current?.logger(executionEvent);
          if (toolCallId) toolTiming.byId.delete(toolCallId);
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
      year: pending.year,
      meetings: pending.meetings,
      meeting: pending.meeting,
      session: pending.session,
      dir: pending.dir,
    });
  };

  const handleApiKeySave = async (apiKey: string) => {
    setApiKeyError(null);
    try {
      await writeOpenAIApiKey('f1aire', apiKey);
      setStoredApiKey(apiKey.trim());
      const pending = pendingEngineerRef.current;
      if (pending) {
        pendingEngineerRef.current = null;
        await startEngineer(pending, apiKey.trim());
        return;
      }
      if (screen.name === 'apiKey') {
        setScreen(screen.returnTo);
      }
    } catch (err) {
      setApiKeyError(formatUnknownError(err));
    }
  };

  const handleSettingsAction = (action: SettingsAction) => {
    if (action === 'back') {
      const next = getBackScreen(screen);
      if (next) setScreen(next);
      return;
    }
    if (action === 'paste') {
      setApiKeyError(null);
      setScreen({ name: 'apiKey', returnTo: screen });
      return;
    }
    if (action === 'clear') {
      void (async () => {
        try {
          await clearStoredOpenAIApiKey('f1aire');
          setStoredApiKey(null);
        } catch (err) {
          setApiKeyError(formatUnknownError(err));
        }
      })();
      return;
    }
  };

  const breadcrumb = useMemo(() => {
    if (screen.name === 'season') return ['Season'];
    if (screen.name === 'settings') return ['Settings'];
    if (screen.name === 'apiKey') return ['OpenAI API Key'];
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
    if (screen.name === 'engineer' || screen.name === 'apiKey') {
      if (key.escape) {
        if (screen.name === 'apiKey') {
          pendingEngineerRef.current = null;
          setApiKeyError(null);
        }
        const next = getBackScreen(screen);
        if (next) setScreen(next);
      }
      if (key.ctrl && input === 'c') process.exit(0);
      return;
    }
    if (
      input === 's' &&
      runtimeReady &&
      (screen.name === 'season' ||
        screen.name === 'meeting' ||
        screen.name === 'session' ||
        screen.name === 'summary')
    ) {
      setApiKeyError(null);
      setScreen({ name: 'settings', returnTo: screen });
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
        {!runtimeReady ? (
          <RuntimePreparing message={runtimeMessage} progress={runtimeProgress ?? undefined} />
        ) : (
          <>
            {screen.name === 'season' && (
              <SeasonPicker
                onSelect={async (year) => {
                  const data = await getMeetings(year);
                  setScreen({ name: 'meeting', year, meetings: data.Meetings });
                }}
              />
            )}
            {screen.name === 'settings' && (
              <Settings status={keyStatus} onAction={handleSettingsAction} />
            )}
            {screen.name === 'apiKey' && (
              <ApiKeyPrompt
                configPath={configPath}
                onSave={handleApiKeySave}
                error={apiKeyError}
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
                    const key = await resolveApiKeyForUse();
                    const pending: PendingEngineer = {
                      year: screen.year,
                      meetings: screen.meetings,
                      meeting: screen.meeting,
                      session: screen.session,
                      dir,
                    };
                    if (!key) {
                      pendingEngineerRef.current = pending;
                      setApiKeyError(null);
                      setScreen({
                        name: 'apiKey',
                        returnTo: getBackScreen(screen) ?? { name: 'season' },
                      });
                      return;
                    }
                    await startEngineer(pending, key);
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
                pythonCode={pythonCodePreview}
                maxHeight={contentHeight}
                asOfLabel={asOfLabel}
              />
            )}
            {screen.name === 'summary' && (
              <Summary summary={screen.summary} dir={screen.dir} />
            )}
          </>
        )}
      </Box>
      <FooterHints screen={screen.name} />
    </Box>
  );
}
