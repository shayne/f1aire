import { createOpenAI } from '@ai-sdk/openai';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { useEffect, useRef, useState } from 'react';
import { createEngineerLogger } from '../../agent/engineer-logger.js';
import { createEngineerSession } from '../../agent/engineer.js';
import { formatUnknownError } from '../../agent/error-utils.js';
import { systemPrompt } from '../../agent/prompt.js';
import {
  getTranscriptSessionKey,
  loadTranscriptEvents,
  saveTranscriptEvents,
} from '../../agent/session-transcript-store.js';
import { makeTools } from '../../agent/tools.js';
import type { TranscriptEvent } from '../../agent/transcript-events.js';
import {
  summarizeFromLines,
  type Summary as SummaryData,
} from '../../core/summary.js';
import { loadSessionStore } from '../../core/session-store.js';
import {
  hydrateTimingServiceFromStore,
  TimingService,
} from '../../core/timing-service.js';
import type { TimeCursor } from '../../core/time-cursor.js';
import { getDataDir } from '../../core/xdg.js';
import { appendUserMessage, type ChatMessage } from '../chat-state.js';
import type { Screen } from '../navigation.js';
import { startEventLoopLagMonitor } from '../perf.js';

type ToolTimingEntry = {
  toolName: string;
  toolCallId?: string;
  inputBytes?: number;
  inputStart?: number;
  callStart?: number;
};

type ToolPart = Record<string, unknown>;

type EngineerScreen = Extract<Screen, { name: 'engineer' }>;

export type PendingEngineer = Omit<
  Extract<Screen, { name: 'downloading' }>,
  'name'
> & {
  dir: string;
};

type StartEngineerOptions = {
  resumeTranscript?: boolean;
};

type KeyStatus = {
  envKeyPresent: boolean;
  storedKeyPresent: boolean;
  inUse: 'env' | 'stored' | 'none';
};

function tryExtractJsonStringField(
  value: string,
  fieldName: string,
): string | null {
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

const asObject = (value: unknown): ToolPart | undefined =>
  value && typeof value === 'object' ? (value as ToolPart) : undefined;

const getStringField = (
  source: ToolPart | undefined,
  fieldName: string,
): string | undefined => {
  const value = source?.[fieldName];
  return typeof value === 'string' ? value : undefined;
};

const getToolInput = (part: ToolPart): unknown =>
  part.args ??
  part.input ??
  asObject(part.toolCall)?.args ??
  asObject(part.tool)?.args ??
  part.toolInput;

const getToolName = (part: ToolPart): string =>
  getStringField(part, 'toolName') ??
  getStringField(asObject(part.tool), 'name') ??
  getStringField(asObject(part.toolCall), 'name') ??
  'tool';

const getToolCallId = (part: ToolPart): string | undefined => {
  return (
    getStringField(part, 'toolCallId') ??
    getStringField(asObject(part.toolCall), 'id') ??
    getStringField(part, 'id')
  );
};

const getToolInputBytes = (part: ToolPart): number | undefined => {
  const input = getToolInput(part);
  if (input == null) return undefined;
  if (typeof input === 'string') return Buffer.byteLength(input, 'utf-8');
  try {
    return Buffer.byteLength(JSON.stringify(input), 'utf-8');
  } catch {
    return undefined;
  }
};

function createSummaryTranscript(summaryText: string): TranscriptEvent[] {
  return [
    {
      id: 'assistant-1',
      type: 'assistant-message',
      text: summaryText,
      streaming: false,
    },
  ];
}

function transcriptEventsToMessages(events: TranscriptEvent[]): ChatMessage[] {
  return events.flatMap((event): ChatMessage[] => {
    if (event.type === 'user-message') {
      return [{ role: 'user', content: event.text }];
    }

    if (event.type === 'assistant-message') {
      return [{ role: 'assistant', content: event.text }];
    }

    return [];
  });
}

function getSessionTranscriptEvents(
  session: ReturnType<typeof createEngineerSession>,
): TranscriptEvent[] | null {
  const transcriptGetter = (
    session as {
      getTranscriptEvents?: () => TranscriptEvent[];
    }
  ).getTranscriptEvents;

  if (typeof transcriptGetter !== 'function') {
    return null;
  }

  return transcriptGetter.call(session);
}

export function useEngineerSession({
  keyStatus,
  screenName,
  setScreen,
  storedApiKey,
  resolveApiKeyForUse,
}: {
  keyStatus: KeyStatus;
  screenName: Screen['name'];
  setScreen: (screen: Screen) => void;
  storedApiKey: string | null;
  resolveApiKeyForUse: () => Promise<string | null>;
}): {
  activity: string[];
  clearPendingEngineer: () => void;
  handleSend: (text: string) => Promise<void>;
  isStreaming: boolean;
  messages: ChatMessage[];
  pythonCodePreview: string;
  queuePendingEngineer: (pending: PendingEngineer) => void;
  startEngineer: (
    pending: PendingEngineer,
    apiKey: string,
    options?: StartEngineerOptions,
  ) => Promise<void>;
  streamStatus: string | null;
  streamingText: string;
  summary: SummaryData | null;
  takePendingEngineer: () => PendingEngineer | null;
  timeCursor: TimeCursor;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [pythonCodePreview, setPythonCodePreview] = useState('');
  const [pythonCodeTarget, setPythonCodeTarget] = useState('');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeCursor, setTimeCursor] = useState<TimeCursor>({ latest: true });
  const engineerRef = useRef<ReturnType<typeof createEngineerSession> | null>(
    null,
  );
  const pendingEngineerRef = useRef<PendingEngineer | null>(null);
  const transcriptSessionKeyRef = useRef<string | null>(null);
  const engineerLoggerRef = useRef<ReturnType<
    typeof createEngineerLogger
  > | null>(null);
  const toolTimingRef = useRef({
    byId: new Map<string, ToolTimingEntry>(),
    inputQueue: [] as ToolTimingEntry[],
    callQueue: [] as ToolTimingEntry[],
  });
  const toolInputPreviewRef = useRef(new Map<string, string>());
  const perfStopRef = useRef<(() => void) | null>(null);

  if (!engineerLoggerRef.current) {
    engineerLoggerRef.current = createEngineerLogger({
      dataDir: getDataDir('f1aire'),
    });
  }

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
    perfStopRef.current?.();
    perfStopRef.current = null;
    if (screenName !== 'engineer') return;
    perfStopRef.current = startEventLoopLagMonitor({
      logger: engineerLoggerRef.current?.logger ?? undefined,
      intervalMs: 100,
      warnMs: 150,
    });
    return () => {
      perfStopRef.current?.();
      perfStopRef.current = null;
    };
  }, [screenName]);

  const pushActivity = (entry: string) => {
    setActivity((prev) => {
      if (prev[prev.length - 1] === entry) return prev;
      const next = [...prev, entry];
      return next.slice(-6);
    });
  };

  const queuePendingEngineer = (pending: PendingEngineer) => {
    pendingEngineerRef.current = pending;
  };

  const clearPendingEngineer = () => {
    pendingEngineerRef.current = null;
  };

  const takePendingEngineer = () => {
    const pending = pendingEngineerRef.current;
    pendingEngineerRef.current = null;
    return pending;
  };

  const handleSend = async (text: string) => {
    if (isStreaming) return;
    const session = engineerRef.current;
    if (!session) return;
    const transcriptSessionKey = transcriptSessionKeyRef.current;
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
      const transcriptEvents = getSessionTranscriptEvents(session);
      if (transcriptSessionKey && transcriptEvents) {
        await saveTranscriptEvents({
          dataDir: getDataDir('f1aire'),
          sessionKey: transcriptSessionKey,
          events: transcriptEvents,
        });
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

  const startEngineer = async (
    pending: PendingEngineer,
    apiKey: string,
    options: StartEngineerOptions = {},
  ) => {
    const resumeTranscript = options.resumeTranscript ?? true;
    const livePath = path.join(pending.dir, 'live.jsonl');
    const lines = fs.readFileSync(livePath, 'utf-8');
    const computedSummary = summarizeFromLines(lines);
    const summaryText = [
      'Quick summary:',
      '',
      computedSummary.winner
        ? `- Winner: ${computedSummary.winner.name} (#${computedSummary.winner.number})`
        : '- Winner: unavailable',
      computedSummary.fastestLap
        ? `- Fastest lap: ${computedSummary.fastestLap.name} (#${computedSummary.fastestLap.number}) ${computedSummary.fastestLap.time}`
        : '- Fastest lap: unavailable',
      computedSummary.totalLaps
        ? `- Total laps: ${computedSummary.totalLaps}`
        : '- Total laps: unavailable',
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
    const processStart = performance.now();
    const hydration = hydrateTimingServiceFromStore({
      service: timingService,
      store,
    });
    const processDurationMs = performance.now() - processStart;
    void engineerLoggerRef.current?.logger({
      type: 'timing-process',
      durationMs: Math.round(processDurationMs),
      livePoints: hydration.livePoints,
      subscribeTopics: hydration.subscribeTopics.length,
      keyframeTopics: hydration.keyframeTopics.length,
    });

    const initialTimeCursor: TimeCursor = { latest: true };
    setTimeCursor(initialTimeCursor);
    const tools = makeTools({
      store,
      processors: timingService.processors,
      timeCursor: initialTimeCursor,
      onTimeCursorChange: setTimeCursor,
      logger: engineerLoggerRef.current?.logger ?? undefined,
      resolveOpenAIApiKey: resolveApiKeyForUse,
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

    const transcriptSessionKey = getTranscriptSessionKey({
      year: pending.year,
      meetingKey: pending.meeting.Key,
      sessionKey: pending.session.Key,
    });
    transcriptSessionKeyRef.current = transcriptSessionKey;
    let storedTranscript: TranscriptEvent[] = [];
    if (resumeTranscript) {
      try {
        storedTranscript = await loadTranscriptEvents({
          dataDir: getDataDir('f1aire'),
          sessionKey: transcriptSessionKey,
        });
      } catch {
        storedTranscript = [];
      }
    }
    const initialTranscript =
      storedTranscript.length > 0
        ? storedTranscript
        : createSummaryTranscript(summaryText);

    if (!resumeTranscript) {
      await saveTranscriptEvents({
        dataDir: getDataDir('f1aire'),
        sessionKey: transcriptSessionKey,
        events: initialTranscript,
      });
    }

    engineerRef.current = createEngineerSession({
      model,
      tools,
      system: systemPrompt,
      initialTranscript,
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
          const msg = typeof event.error === 'string' ? event.error : 'error';
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
        if (partType === 'reasoning-start' || partType === 'start-step') {
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
            getStringField(part, 'inputTextDelta') ??
            getStringField(part, 'delta');
          if (typeof toolCallId !== 'string' || typeof delta !== 'string') {
            return;
          }
          const previous = toolInputPreviewRef.current.get(toolCallId) ?? '';
          const next = previous + delta;
          toolInputPreviewRef.current.set(toolCallId, next);
          const toolName =
            toolTimingRef.current.byId.get(toolCallId)?.toolName ??
            toolTimingRef.current.inputQueue.find(
              (entry) => entry.toolCallId === toolCallId,
            )?.toolName;
          if (toolName === 'run_py') {
            const extracted = tryExtractJsonStringField(next, 'code');
            if (extracted != null) setPythonCodeTarget(extracted);
          }
          return;
        }
        if (partType === 'tool-input-available') {
          const toolName = getToolName(part);
          if (toolName === 'run_py') {
            const code = getStringField(asObject(part.input), 'code');
            if (code) setPythonCodeTarget(code);
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
            const code = getStringField(asObject(getToolInput(part)), 'code');
            if (code) setPythonCodeTarget(code);
          }
          setStreamStatus(`Running tool: ${toolName}`);
          pushActivity(`Running tool: ${toolName}`);
          return;
        }
        if (partType === 'tool-result') {
          const toolName = getToolName(part);
          const toolCallId = getToolCallId(part);
          const toolTiming = toolTimingRef.current;
          let entry: ToolTimingEntry | undefined = toolCallId
            ? toolTiming.byId.get(toolCallId)
            : undefined;
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
    setMessages(transcriptEventsToMessages(initialTranscript));
    setStreamingText('');
    setScreen({
      name: 'engineer',
      year: pending.year,
      meetings: pending.meetings,
      meeting: pending.meeting,
      session: pending.session,
      dir: pending.dir,
    } satisfies EngineerScreen);
  };

  return {
    activity,
    clearPendingEngineer,
    handleSend,
    isStreaming,
    messages,
    pythonCodePreview,
    queuePendingEngineer,
    startEngineer,
    streamStatus,
    streamingText,
    summary,
    takePendingEngineer,
    timeCursor,
  };
}
