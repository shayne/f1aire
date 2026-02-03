import { describe, it, expect, vi } from 'vitest';
import { createPythonClient } from './client.js';

class FakeWorker {
  listeners: Record<string, Function[]> = {};
  postMessage = vi.fn((msg) => {
    if (msg.type === 'init') {
      this.emit('message', { type: 'init-result', ok: true });
    }
    if (msg.type === 'run') {
      this.emit('message', { type: 'run-result', id: msg.id, ok: true, value: { ok: 1 } });
    }
  });
  on(event: string, cb: Function) {
    this.listeners[event] = this.listeners[event] ?? [];
    this.listeners[event].push(cb);
  }
  emit(event: string, payload: unknown) {
    for (const cb of this.listeners[event] ?? []) cb(payload);
  }
  terminate = vi.fn();
}

describe('createPythonClient', () => {
  it('initializes and runs code via worker', async () => {
    const client = createPythonClient({
      workerFactory: () => new FakeWorker() as any,
    });
    await client.init({ indexURL: '/tmp/pyodide' });
    const result = await client.run({ code: '1+1' });
    expect(result).toEqual({ ok: true, value: { ok: 1 } });
  });
});
