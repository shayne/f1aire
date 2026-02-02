import { stepCountIs, streamText, type ToolSet } from 'ai';
import type { LanguageModel } from 'ai';
import { formatUnknownError } from './error-utils.js';

type Message = { role: 'user' | 'assistant'; content: string };

type CreateEngineerSessionArgs = {
  model: LanguageModel;
  tools: ToolSet;
  system: string;
  streamTextFn?: typeof streamText;
  logger?: (event: Record<string, unknown>) => void | Promise<void>;
  onEvent?: (event: { type: string; [key: string]: unknown }) => void;
};

export function createEngineerSession({
  model,
  tools,
  system,
  streamTextFn = streamText,
  logger,
  onEvent,
}: CreateEngineerSessionArgs) {
  const messages: Message[] = [];

  return {
    async *send(input: string) {
      logger?.({ type: 'send-start', inputLength: input.length });
      onEvent?.({ type: 'send-start', inputLength: input.length });
      messages.push({ role: 'user', content: input });
      let errorMessage: string | null = null;
      let sawToolCall = false;
      const result = await streamTextFn({
        model,
        system,
        messages,
        tools,
        stopWhen: stepCountIs(5),
        onError({ error }) {
          errorMessage = formatUnknownError(error);
          logger?.({
            type: 'stream-error',
            error: errorMessage,
          });
          onEvent?.({ type: 'stream-error', error: errorMessage });
        },
      });
      let buffer = '';
      let hadText = false;
      for await (const part of result.fullStream) {
        onEvent?.({ type: 'stream-part', part });
        if (part.type !== 'text-delta') {
          logger?.({ type: 'stream-part', partType: part.type });
        }
        if (
          part.type === 'tool-call' ||
          part.type === 'tool-result' ||
          part.type === 'tool-input-start'
        ) {
          sawToolCall = true;
        }
        if (part.type === 'text-delta') {
          hadText = true;
          buffer += part.text;
          yield part.text;
        }
        if (part.type === 'error') {
          errorMessage = formatUnknownError(part.error);
          onEvent?.({ type: 'stream-error', error: errorMessage });
        }
        if (part.type === 'tool-error') {
          errorMessage = formatUnknownError(part.error);
          onEvent?.({ type: 'tool-error', error: errorMessage });
        }
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
        yield buffer;
      }
      logger?.({
        type: 'send-finish',
        outputLength: buffer.length,
        hadText,
        sawToolCall,
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
