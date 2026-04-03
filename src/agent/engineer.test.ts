import { describe, it, expect, vi } from 'vitest';
import type { TranscriptEvent } from './transcript-events.js';
import { createEngineerSession } from './engineer.js';

describe('engineer session', () => {
  it('returns a session with send()', async () => {
    const session = createEngineerSession({
      model: {} as any,
      tools: {} as any,
      system: 'x',
      streamTextFn: (async () =>
        ({
          fullStream: (async function* () {
            yield { type: 'text-delta', id: 't1', text: 'ok' };
          })(),
        }) as any) as any,
    });
    const stream = session.send('hello');
    const parts: string[] = [];
    for await (const t of stream) parts.push(t);
    expect(parts.join('')).toBe('ok');
  });

  it('allows enough tool steps for python self-healing', async () => {
    const streamTextFn = vi.fn(
      async () =>
        ({
          fullStream: (async function* () {
            yield { type: 'text-delta', id: 't1', text: 'ok' };
          })(),
        }) as any,
    );

    const session = createEngineerSession({
      model: {} as any,
      tools: {} as any,
      system: 'x',
      streamTextFn: streamTextFn as any,
    });

    // Trigger the underlying streamText call.
    const out: string[] = [];
    for await (const t of session.send('hello')) out.push(t);
    expect(out.join('')).toBe('ok');

    const [{ stopWhen }] = streamTextFn.mock.calls[0] ?? [];
    expect(stopWhen).toBeTypeOf('function');

    // stepCountIs(N) stops when steps.length === N.
    expect(stopWhen({ steps: new Array(7).fill({}) })).toBe(false);
    expect(stopWhen({ steps: new Array(8).fill({}) })).toBe(true);
  });

  it('stores transcript events for user text, tool lifecycle, and assistant output', async () => {
    const initialTranscript: TranscriptEvent[] = [
      {
        id: 'seed-assistant',
        type: 'assistant-message',
        text: 'Quick summary ready.',
        streaming: false,
      },
    ];
    const session = createEngineerSession({
      model: {} as any,
      tools: {} as any,
      system: 'x',
      initialTranscript,
      streamTextFn: (async () =>
        ({
          fullStream: (async function* () {
            yield {
              type: 'tool-call',
              toolCallId: 'tool-123',
              toolName: 'compare_lap_times',
            };
            yield {
              type: 'tool-result',
              toolCallId: 'tool-123',
              toolName: 'compare_lap_times',
            };
            yield { type: 'text-delta', id: 't1', text: 'Pace is ' };
            yield { type: 'text-delta', id: 't2', text: 'stable.' };
          })(),
        }) as any) as any,
    });

    const parts: string[] = [];
    for await (const chunk of session.send('Compare pace')) parts.push(chunk);

    expect(parts.join('')).toBe('Pace is stable.');
    expect(session.getTranscriptEvents()).toEqual([
      {
        id: 'seed-assistant',
        type: 'assistant-message',
        text: 'Quick summary ready.',
        streaming: false,
      },
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Compare pace',
      },
      {
        id: 'tool-123',
        type: 'tool-call',
        toolName: 'compare_lap_times',
        label: 'Running tool: compare_lap_times',
      },
      {
        id: 'tool-123-result',
        type: 'tool-result',
        toolName: 'compare_lap_times',
        label: 'Processing result: compare_lap_times',
      },
      {
        id: 'assistant-1',
        type: 'assistant-message',
        text: 'Pace is stable.',
        streaming: false,
      },
    ]);
  });

  it('seeds follow-up model history from initial transcript messages', async () => {
    let callMessages: unknown;
    const streamTextFn = vi.fn(
      async ({ messages }) => {
        callMessages = messages.map(
          (message: { role: string; content: string }) => ({ ...message }),
        );
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', id: 't1', text: 'Copy.' };
          })(),
        } as any;
      },
    );

    const session = createEngineerSession({
      model: {} as any,
      tools: {} as any,
      system: 'x',
      initialTranscript: [
        {
          id: 'user-1',
          type: 'user-message',
          text: 'Summarize the opening stint.',
        },
        {
          id: 'assistant-1',
          type: 'assistant-message',
          text: 'Verstappen led the medium runners.',
          streaming: false,
        },
      ],
      streamTextFn: streamTextFn as any,
    });

    for await (const _chunk of session.send('Compare Norris next.')) {
      // Drain stream.
    }

    expect(callMessages).toEqual([
      { role: 'user', content: 'Summarize the opening stint.' },
      { role: 'assistant', content: 'Verstappen led the medium runners.' },
      { role: 'user', content: 'Compare Norris next.' },
    ]);
  });

  it('records an assistant error event when stream setup throws before rethrowing', async () => {
    const session = createEngineerSession({
      model: {} as any,
      tools: {} as any,
      system: 'x',
      streamTextFn: (async () => {
        throw new Error('stream setup failed');
      }) as any,
    });

    await expect(async () => {
      for await (const _chunk of session.send('Hello')) {
        // Drain stream.
      }
    }).rejects.toThrow('stream setup failed');

    expect(session.getTranscriptEvents()).toEqual([
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Hello',
      },
      {
        id: 'assistant-1',
        type: 'assistant-message',
        text: 'Error: stream setup failed',
        streaming: false,
      },
    ]);
  });
});
