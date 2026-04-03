import { stepCountIs, streamText, type ToolSet } from 'ai';
import type { LanguageModel } from 'ai';
import { formatUnknownError } from './error-utils.js';
import type {
  AssistantMessageEvent,
  ToolCallEvent,
  ToolResultEvent,
  TranscriptEvent,
  UserMessageEvent,
} from './transcript-events.js';

type Message = { role: 'user' | 'assistant'; content: string };

type CreateEngineerSessionArgs = {
  model: LanguageModel;
  tools: ToolSet;
  system: string;
  initialTranscript?: TranscriptEvent[];
  streamTextFn?: typeof streamText;
  logger?: (event: Record<string, unknown>) => void | Promise<void>;
  onEvent?: (event: { type: string; [key: string]: unknown }) => void;
};

function getNextEventSequence(
  events: TranscriptEvent[],
  prefix: string,
): number {
  let next = 1;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);

  for (const event of events) {
    const match = pattern.exec(event.id);
    if (!match) continue;
    next = Math.max(next, Number.parseInt(match[1] ?? '0', 10) + 1);
  }

  return next;
}

function cloneTranscriptEvent(event: TranscriptEvent): TranscriptEvent {
  return { ...event };
}

function createInitialMessages(initialTranscript: TranscriptEvent[]): Message[] {
  return initialTranscript.flatMap((event): Message[] => {
    if (event.type === 'user-message') {
      return [{ role: 'user', content: event.text }];
    }

    if (event.type === 'assistant-message') {
      return [{ role: 'assistant', content: event.text }];
    }

    return [];
  });
}

export function createEngineerSession({
  model,
  tools,
  system,
  initialTranscript = [],
  streamTextFn = streamText,
  logger,
  onEvent,
}: CreateEngineerSessionArgs) {
  const messages = createInitialMessages(initialTranscript);
  const transcriptEvents = initialTranscript.map((event) =>
    cloneTranscriptEvent(event),
  );
  const pendingToolEventIds = new Map<string, string>();
  const pendingAnonymousToolEventIds: string[] = [];
  let nextUserEventId = getNextEventSequence(transcriptEvents, 'user');
  let nextAssistantEventId = getNextEventSequence(
    transcriptEvents,
    'assistant',
  );
  let nextToolEventId = getNextEventSequence(transcriptEvents, 'tool');

  const getToolName = (part: unknown): string | undefined => {
    const value =
      (part as any)?.toolName ??
      (part as any)?.tool?.name ??
      (part as any)?.toolCall?.name ??
      (part as any)?.name;
    return typeof value === 'string' ? value : undefined;
  };

  const getToolCallId = (part: unknown): string | undefined => {
    const value =
      (part as any)?.toolCallId ??
      (part as any)?.toolCall?.id ??
      (part as any)?.id;
    return typeof value === 'string' ? value : undefined;
  };

  const appendToolCallEvent = (part: unknown) => {
    const toolName = getToolName(part) ?? 'tool';
    const toolCallId = getToolCallId(part);
    const eventId = toolCallId ?? `tool-${nextToolEventId++}`;
    const event: ToolCallEvent = {
      id: eventId,
      type: 'tool-call',
      toolName,
      label: `Running tool: ${toolName}`,
    };

    transcriptEvents.push(event);

    if (toolCallId) {
      pendingToolEventIds.set(toolCallId, eventId);
    } else {
      pendingAnonymousToolEventIds.push(eventId);
    }
  };

  const appendToolResultEvent = (part: unknown, error?: string) => {
    const toolName = getToolName(part) ?? 'tool';
    const toolCallId = getToolCallId(part);
    const toolEventId =
      (toolCallId ? pendingToolEventIds.get(toolCallId) : undefined) ??
      pendingAnonymousToolEventIds.shift() ??
      toolCallId ??
      `tool-${nextToolEventId++}`;
    const event: ToolResultEvent = {
      id: `${toolEventId}-result`,
      type: 'tool-result',
      toolName,
      label: `Processing result: ${toolName}`,
      ...(error ? { error } : {}),
    };

    transcriptEvents.push(event);

    if (toolCallId) {
      pendingToolEventIds.delete(toolCallId);
    }
  };

  const resetPendingToolEvents = () => {
    pendingToolEventIds.clear();
    pendingAnonymousToolEventIds.length = 0;
  };

  return {
    getTranscriptEvents() {
      return transcriptEvents.map((event) => cloneTranscriptEvent(event));
    },
    async *send(input: string) {
      logger?.({ type: 'send-start', inputLength: input.length });
      onEvent?.({ type: 'send-start', inputLength: input.length });
      resetPendingToolEvents();
      const userEvent: UserMessageEvent = {
        id: `user-${nextUserEventId++}`,
        type: 'user-message',
        text: input,
      };
      transcriptEvents.push(userEvent);
      messages.push({ role: 'user', content: input });
      let errorMessage: string | null = null;
      let sawToolCall = false;
      let assistantEvent: AssistantMessageEvent | null = null;
      const ensureAssistantEvent = () => {
        if (!assistantEvent) {
          assistantEvent = {
            id: `assistant-${nextAssistantEventId++}`,
            type: 'assistant-message',
            text: '',
            streaming: true,
          };
          transcriptEvents.push(assistantEvent);
        }
        return assistantEvent;
      };
      let buffer = '';
      let hadText = false;
      let finishReason: string | undefined;
      let stepCount: number | undefined;
      try {
        const result = await streamTextFn({
          model,
          system,
          messages,
          tools,
          // Allow enough steps for tool retries (e.g. python self-healing) while
          // keeping an upper bound so a bad loop can't run forever.
          stopWhen: stepCountIs(16),
          onError({ error }) {
            errorMessage = formatUnknownError(error);
            logger?.({
              type: 'stream-error',
              error: errorMessage,
            });
            onEvent?.({ type: 'stream-error', error: errorMessage });
          },
        });

        for await (const part of result.fullStream) {
          onEvent?.({ type: 'stream-part', part });
          if (part.type !== 'text-delta') {
            const logEvent: Record<string, unknown> = {
              type: 'stream-part',
              partType: part.type,
            };
            const toolName = getToolName(part);
            const toolCallId = getToolCallId(part);
            if (toolName) logEvent.toolName = toolName;
            if (toolCallId) logEvent.toolCallId = toolCallId;
            if (part.type === 'tool-error' || part.type === 'error') {
              logEvent.error = formatUnknownError((part as any).error);
            }
            logger?.(logEvent);
          }
          if (
            part.type === 'tool-call' ||
            part.type === 'tool-result' ||
            part.type === 'tool-input-start'
          ) {
            sawToolCall = true;
          }
          if (part.type === 'tool-call') {
            appendToolCallEvent(part);
          }
          if (part.type === 'tool-result') {
            appendToolResultEvent(part);
          }
          if (part.type === 'text-delta') {
            hadText = true;
            buffer += part.text;
            const event = ensureAssistantEvent();
            event.text = buffer;
            yield part.text;
          }
          if (part.type === 'error') {
            errorMessage = formatUnknownError(part.error);
            onEvent?.({ type: 'stream-error', error: errorMessage });
          }
          if (part.type === 'tool-error') {
            errorMessage = formatUnknownError(part.error);
            appendToolResultEvent(part, errorMessage);
            onEvent?.({ type: 'tool-error', error: errorMessage });
          }
        }

        try {
          finishReason = await result.finishReason;
          stepCount = (await result.steps).length;
        } catch {
          finishReason = undefined;
          stepCount = undefined;
        }

        if (!hadText) {
          if (errorMessage) {
            buffer = `Error: ${errorMessage}`;
          } else {
            try {
              buffer = await result.text;
            } catch {
              buffer = '';
            }
            if (!buffer) {
              buffer = sawToolCall
                ? 'No response received after tool calls. Please try again.'
                : 'No response received. Please try again.';
            }
          }
          const event = ensureAssistantEvent();
          event.text = buffer;
          yield buffer;
        }
      } catch (error) {
        const formattedError = `Error: ${formatUnknownError(error)}`;
        buffer = buffer ? `${buffer}\n\n${formattedError}` : formattedError;
        const event = ensureAssistantEvent();
        event.text = buffer;
        event.streaming = false;
        messages.push({ role: 'assistant', content: buffer });
        throw error;
      } finally {
        resetPendingToolEvents();
      }

      const finalAssistantEvent = ensureAssistantEvent();
      finalAssistantEvent.text = buffer;
      finalAssistantEvent.streaming = false;
      logger?.({
        type: 'send-finish',
        outputLength: buffer.length,
        hadText,
        sawToolCall,
        finishReason,
        stepCount,
      });
      onEvent?.({
        type: 'send-finish',
        outputLength: buffer.length,
        hadText,
      });
      messages.push({ role: 'assistant', content: buffer });
    },
  };
}
