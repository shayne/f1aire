import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { createPythonClient, resolveWorkerSpec } from './client.js';

class FakeWorker {
  listeners: Record<string, Function[]> = {};
  inited = false;
  postMessage = vi.fn((msg) => {
    if (msg.type === 'init') {
      this.inited = true;
      this.emit('message', { type: 'init-result', ok: true });
    }
    if (msg.type === 'run') {
      if (!this.inited) {
        this.emit('message', { type: 'run-result', id: msg.id, ok: false, error: 'pyodide is not initialized' });
        return;
      }
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

  it('auto-initializes a new worker on run after the previous worker exits', async () => {
    const workers: FakeWorker[] = [];
    const client = createPythonClient({
      workerFactory: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w as any;
      },
    });

    await client.init({ indexURL: '/tmp/pyodide' });
    expect(workers).toHaveLength(1);

    // Simulate a worker crash/restart.
    workers[0]!.emit('exit', 1);

    const result = await client.run({ code: '1+1' });
    expect(result.ok).toBe(true);
    expect(workers.length).toBeGreaterThanOrEqual(2);

    const second = workers[1]!;
    const messageTypes = second.postMessage.mock.calls.map((call) => (call[0] as any).type);
    expect(messageTypes[0]).toBe('init');
    expect(messageTypes).toContain('run');
  });

  it('recycles worker and retries when pyodide reports a fatal runtime failure', async () => {
    let workerCount = 0;
    const workers: FakeWorker[] = [];
    const client = createPythonClient({
      workerFactory: () => {
        workerCount += 1;
        const worker = new FakeWorker();
        if (workerCount === 1) {
          worker.postMessage = vi.fn((msg) => {
            if (msg.type === 'init') {
              worker.inited = true;
              worker.emit('message', { type: 'init-result', ok: true });
              return;
            }
            if (msg.type === 'run') {
              worker.emit('message', {
                type: 'run-result',
                id: msg.id,
                ok: false,
                error: 'Pyodide already fatally failed and can no longer be used',
              });
            }
          });
        }
        workers.push(worker);
        return worker as any;
      },
    });

    await client.init({ indexURL: '/tmp/pyodide' });
    const result = await client.run({ code: '1+1' });

    expect(result).toEqual({ ok: true, value: { ok: 1 } });
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminate).toHaveBeenCalled();
  });

  it('handles tool-call from worker and posts tool-result', async () => {
    const worker = new FakeWorker();
    const toolHandler = vi.fn().mockResolvedValue({ ok: 1 });
    const client = createPythonClient({
      workerFactory: () => worker as any,
      toolHandler,
    });

    await client.init({ indexURL: '/tmp/pyodide' });
    worker.emit('message', { type: 'tool-call', id: 'abc', name: 'get_driver_list', args: {} });
    await Promise.resolve();

    expect(toolHandler).toHaveBeenCalledWith('get_driver_list', {});
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'tool-result',
      id: 'abc',
      ok: true,
      value: { ok: 1 },
    });
  });

  it('json-clones non-cloneable tool results before posting to the worker', async () => {
    class CloneCheckingWorker {
      listeners: Record<string, Function[]> = {};
      inited = false;
      postMessage = vi.fn((msg) => {
        if (msg.type === 'init') {
          this.inited = true;
          this.emit('message', { type: 'init-result', ok: true });
          return;
        }
        if (msg.type === 'tool-result' && msg.ok) {
          // Simulate Node worker_threads structured clone behavior.
          structuredClone(msg);
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

    const worker = new CloneCheckingWorker();
    const toolHandler = vi.fn().mockResolvedValue({ ok: 1, fn: () => {} });
    const client = createPythonClient({
      workerFactory: () => worker as any,
      toolHandler,
    });

    await client.init({ indexURL: '/tmp/pyodide' });
    worker.emit('message', { type: 'tool-call', id: 'abc', name: 'get_driver_list', args: {} });
    await new Promise((resolve) => setImmediate(resolve));

    const toolResultMessages = worker.postMessage.mock.calls
      .map((call) => call[0] as any)
      .filter((msg) => msg.type === 'tool-result' && msg.ok);
    expect(toolResultMessages.length).toBeGreaterThanOrEqual(1);
    expect(toolResultMessages[toolResultMessages.length - 1]).toMatchObject({
      type: 'tool-result',
      id: 'abc',
      ok: true,
      value: { ok: 1 },
    });
  });

  it('rejects run_py tool-call with an error result', async () => {
    const worker = new FakeWorker();
    const client = createPythonClient({
      workerFactory: () => worker as any,
    });

    await client.init({ indexURL: '/tmp/pyodide' });
    worker.emit('message', { type: 'tool-call', id: 'abc', name: 'run_py', args: {} });
    await Promise.resolve();

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'tool-result',
      id: 'abc',
      ok: false,
      error: 'run_py is not callable from Python',
    });
  });

  it('returns an error result when tool handler is missing', async () => {
    const worker = new FakeWorker();
    const client = createPythonClient({
      workerFactory: () => worker as any,
    });

    await client.init({ indexURL: '/tmp/pyodide' });
    worker.emit('message', { type: 'tool-call', id: 'abc', name: 'get_driver_list', args: {} });
    await Promise.resolve();

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'tool-result',
      id: 'abc',
      ok: false,
      error: 'tool handler not configured',
    });
  });

  it('does not serialize args when no logger is provided', async () => {
    const worker = new FakeWorker();
    const toolHandler = vi.fn().mockResolvedValue({ ok: 1 });
    const stringifySpy = vi.spyOn(JSON, 'stringify');
    const client = createPythonClient({
      workerFactory: () => worker as any,
      toolHandler,
    });

    await client.init({ indexURL: '/tmp/pyodide' });
    const callsBefore = stringifySpy.mock.calls.length;
    worker.emit('message', {
      type: 'tool-call',
      id: 'abc',
      name: 'get_driver_list',
      args: { foo: 'bar' },
    });
    await Promise.resolve();

    expect(stringifySpy.mock.calls.length).toBe(callsBefore);
    stringifySpy.mockRestore();
  });

  it('swallows logger errors to avoid unhandled rejections', async () => {
    const worker = new FakeWorker();
    const toolHandler = vi.fn().mockResolvedValue({ ok: 1 });
    const logger = vi.fn(() => {
      throw new Error('boom');
    });
    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);

    const client = createPythonClient({
      workerFactory: () => worker as any,
      toolHandler,
      logger,
    });

    await client.init({ indexURL: '/tmp/pyodide' });
    worker.emit('message', { type: 'tool-call', id: 'abc', name: 'get_driver_list', args: {} });
    await new Promise((resolve) => setImmediate(resolve));

    process.removeListener('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'tool-result',
      id: 'abc',
      ok: true,
      value: { ok: 1 },
    });
  });

  it('reuses the init promise for repeated calls', async () => {
    const worker = new FakeWorker();
    const client = createPythonClient({
      workerFactory: () => worker as any,
    });
    await Promise.all([client.init({ indexURL: '/tmp/pyodide' }), client.init({ indexURL: '/tmp/pyodide' })]);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects init when shutdown happens during init', async () => {
    const worker = new FakeWorker();
    worker.postMessage = vi.fn();
    const client = createPythonClient({
      workerFactory: () => worker as any,
    });
    const initPromise = client.init({ indexURL: '/tmp/pyodide' });
    const initResult = expect(initPromise).rejects.toThrow('pyodide init canceled by shutdown');
    await client.shutdown();
    await initResult;
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'shutdown' });
    expect(worker.terminate).toHaveBeenCalled();
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

  it('prefers worker.js when present', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1aire-worker-'));
    const workerJsPath = path.join(tmpDir, 'worker.js');
    fs.writeFileSync(workerJsPath, '// worker js');
    const baseUrl = pathToFileURL(path.join(tmpDir, 'client.ts')).href;

    const spec = resolveWorkerSpec({ baseUrl });

    expect(fileURLToPath(spec.url)).toBe(workerJsPath);
    expect(spec.execArgv).toBeUndefined();
  });

  it('falls back to worker.ts with tsx import when js is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1aire-worker-'));
    const workerTsPath = path.join(tmpDir, 'worker.ts');
    fs.writeFileSync(workerTsPath, '// worker ts');
    const baseUrl = pathToFileURL(path.join(tmpDir, 'client.ts')).href;

    const spec = resolveWorkerSpec({ baseUrl });

    expect(fileURLToPath(spec.url)).toBe(workerTsPath);
    expect(spec.execArgv).toEqual(['--import', 'tsx']);
  });
});
