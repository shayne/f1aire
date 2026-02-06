import { describe, it, expect, vi } from 'vitest';
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
    const streamTextFn = vi.fn(async () =>
      ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'ok' };
        })(),
      }) as any);

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
});
