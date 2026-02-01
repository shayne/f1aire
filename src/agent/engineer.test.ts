import { describe, it, expect } from 'vitest';
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
});
