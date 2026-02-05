import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Worker } from 'node:worker_threads';
import { Worker as NodeWorker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { WorkerMessage, WorkerResponse } from './protocol.js';

type WorkerSpec = {
  url: URL;
  execArgv?: string[];
};

export function resolveWorkerSpec({
  baseUrl = import.meta.url,
  existsSync = fs.existsSync,
}: {
  baseUrl?: string | URL;
  existsSync?: (path: string) => boolean;
} = {}): WorkerSpec {
  const jsUrl = new URL('./worker.js', baseUrl);
  if (existsSync(fileURLToPath(jsUrl))) {
    return { url: jsUrl };
  }
  const tsUrl = new URL('./worker.ts', baseUrl);
  return { url: tsUrl, execArgv: ['--import', 'tsx'] };
}

export function createPythonClient({
  workerFactory = () => {
    const spec = resolveWorkerSpec();
    return new NodeWorker(spec.url, { type: 'module', execArgv: spec.execArgv });
  },
  toolHandler,
  logger,
}: {
  workerFactory?: () => Worker;
  toolHandler?: (name: string, args: unknown) => Promise<unknown>;
  logger?: (event: Record<string, unknown>) => void | Promise<void>;
} = {}) {
  let worker: Worker | null = null;
  let initPromise: Promise<void> | null = null;
  let initReject: ((error: Error) => void) | null = null;
  const pending = new Map<
    string,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();

  function failPending(error: Error) {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }

  function resetWorkerState(error: Error) {
    failPending(error);
    if (initReject) {
      initReject(error);
      initReject = null;
    }
    initPromise = null;
    if (worker) {
      worker.removeAllListeners();
      worker = null;
    }
  }

  function safePostMessage(target: Worker, message: WorkerMessage) {
    try {
      target.postMessage(message);
    }
    catch {
      // Worker likely terminated; avoid unhandled rejection in tool-call handler.
    }
  }

  function getArgsBytes(args: unknown): number | undefined {
    if (args == null) return undefined;
    if (typeof args === 'string') return Buffer.byteLength(args, 'utf-8');
    try {
      return Buffer.byteLength(JSON.stringify(args), 'utf-8');
    } catch {
      return undefined;
    }
  }

  async function handleToolCall({ id, name, args }: { id: string; name: string; args: unknown }) {
    const w = worker;
    if (!w) return;
    const start = performance.now();
    const argsBytes = getArgsBytes(args);
    const logResult = (ok: boolean, error?: string) => {
      logger?.({
        type: 'tool-bridge',
        name,
        toolName: name,
        argsBytes,
        durationMs: Math.round(performance.now() - start),
        ok,
        error,
      });
    };
    if (name === 'run_py') {
      safePostMessage(w, {
        type: 'tool-result',
        id,
        ok: false,
        error: 'run_py is not callable from Python',
      });
      logResult(false, 'run_py is not callable from Python');
      return;
    }
    if (!toolHandler) {
      safePostMessage(w, {
        type: 'tool-result',
        id,
        ok: false,
        error: 'tool handler not configured',
      });
      logResult(false, 'tool handler not configured');
      return;
    }
    try {
      const value = await toolHandler(name, args);
      if (worker !== w) return;
      safePostMessage(w, { type: 'tool-result', id, ok: true, value });
      logResult(true);
    }
    catch (error) {
      if (worker !== w) return;
      const message = error instanceof Error ? error.message : String(error);
      safePostMessage(w, { type: 'tool-result', id, ok: false, error: message });
      logResult(false, message);
    }
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = workerFactory();
    worker.on('message', (msg: WorkerResponse) => {
      if (msg.type === 'init-result') return;
      if (msg.type === 'tool-call') {
        void handleToolCall(msg);
        return;
      }
      if (msg.type === 'run-result') {
        const entry = pending.get(msg.id);
        if (entry) {
          pending.delete(msg.id);
          entry.resolve(msg);
        }
      }
    });
    worker.on('error', (error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      resetWorkerState(err);
    });
    worker.on('exit', (code) => {
      const message =
        typeof code === 'number' && code !== 0
          ? `pyodide worker exited with code ${code}`
          : 'pyodide worker exited';
      resetWorkerState(new Error(message));
    });
    return worker;
  }

  return {
    async init({ indexURL, packageCacheDir }: { indexURL: string; packageCacheDir?: string }) {
      if (initPromise) return initPromise;
      const w = ensureWorker();
      initPromise = new Promise<void>((resolve, reject) => {
        initReject = reject;
        const handleMessage = (msg: WorkerResponse) => {
          if (msg.type !== 'init-result') return;
          w.off('message', handleMessage);
          if (msg.ok) {
            initReject = null;
            resolve();
          }
          else {
            initPromise = null;
            initReject = null;
            reject(new Error(msg.error ?? 'pyodide init failed'));
          }
        };
        w.on('message', handleMessage);
        const resolvedPackageCacheDir =
          packageCacheDir ?? (indexURL.startsWith('file://') ? fileURLToPath(indexURL) : indexURL);
        w.postMessage({ type: 'init', indexURL, packageCacheDir: resolvedPackageCacheDir });
      });
      return initPromise;
    },
    async run({ code, context }: { code: string; context?: unknown }) {
      const w = ensureWorker();
      const id = randomUUID();
      const result = await new Promise<any>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ type: 'run', id, code, context });
      });
      return { ok: result.ok, value: result.value, error: result.error };
    },
    async shutdown() {
      if (!worker) return;
      if (initReject || initPromise) {
        initReject?.(new Error('pyodide init canceled by shutdown'));
      }
      worker.postMessage({ type: 'shutdown' });
      await worker.terminate();
      worker = null;
      initReject = null;
      initPromise = null;
    },
  };
}
