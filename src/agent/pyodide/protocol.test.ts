import { describe, it } from 'vitest';
import { expectTypeOf } from 'expect-type';
import type { WorkerMessage, WorkerResponse } from './protocol.js';

describe('pyodide protocol tool bridge types', () => {
  it('accepts tool-call and tool-result messages', () => {
    const toolCall = {
      type: 'tool-call',
      id: 'tool-1',
      name: 'echo',
      args: { text: 'hi' },
    } as const;

    expectTypeOf(toolCall).toMatchTypeOf<WorkerMessage>();

    const toolResult = {
      type: 'tool-result',
      id: 'tool-1',
      ok: true,
      value: { text: 'hi' },
    } as const;

    expectTypeOf(toolResult).toMatchTypeOf<WorkerResponse>();
  });
});
