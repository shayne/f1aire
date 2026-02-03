import { fileURLToPath, pathToFileURL } from 'node:url';
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
  off(event: string, cb: Function) {
    this.listeners[event] = (this.listeners[event] ?? []).filter((listener) => listener !== cb);
  }
  removeAllListeners() {
    this.listeners = {};
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

  it('reuses the init promise for repeated calls', async () => {
    const worker = new FakeWorker();
    const client = createPythonClient({
      workerFactory: () => worker as any,
    });
    await Promise.all([client.init({ indexURL: '/tmp/pyodide' }), client.init({ indexURL: '/tmp/pyodide' })]);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it('derives packageCacheDir from file indexURL when omitted', async () => {
    const worker = new FakeWorker();
    const client = createPythonClient({
      workerFactory: () => worker as any,
    });
    const indexURL = pathToFileURL('/tmp/pyodide/full/').href;
    await client.init({ indexURL });
    const [initMessage] = worker.postMessage.mock.calls[0] ?? [];
    expect(initMessage).toMatchObject({
      type: 'init',
      indexURL,
      packageCacheDir: fileURLToPath(indexURL),
    });
  });
});
