import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { createPythonClient, resolveWorkerSpec } from './client.js';

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
