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
    return new NodeWorker(spec.url, { type: 'module', execArgv: spec.execArgv } as any);
  },
  toolHandler,
  logger,
}: {
  workerFactory?: () => Worker;
  toolHandler?: (name: string, args: unknown) => Promise<unknown>;
  logger?: (event: Record<string, unknown>) => void | Promise<void>;
} = {}) {
  let worker: Worker | null = null;
  let workerCounter = 0;
  let currentWorkerId = 0;
  let initPromise: Promise<void> | null = null;
  let initReject: ((error: Error) => void) | null = null;
  let initWorkerId: number | null = null;
  let initializedWorkerId: number | null = null;
  let lastInitArgs: { indexURL: string; packageCacheDir?: string } | null = null;
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
    initWorkerId = null;
    initializedWorkerId = null;
    if (worker) {
      worker.removeAllListeners();
      worker = null;
      currentWorkerId = 0;
    }
  }

  async function recycleWorker(error: Error) {
    failPending(error);
    if (initReject) {
      initReject(error);
      initReject = null;
    }
    initPromise = null;
    initWorkerId = null;
    initializedWorkerId = null;
    const stale = worker;
    worker = null;
    currentWorkerId = 0;
    if (stale) {
      stale.removeAllListeners();
      try {
        await stale.terminate();
      } catch {
        // Best-effort recycle.
      }
    }
  }

  function isNotInitializedError(error: unknown): boolean {
    return /pyodide is not initialized/i.test(String(error ?? ''));
  }

  function isFatalRuntimeError(error: unknown): boolean {
    const message = String(error ?? '');
    return /(pyodide.*fatally\s+failed|pyodide.*fatal\s+error|already\s+fatally\s+failed\s+and\s+can\s+no\s+longer\s+be\s+used)/i
      .test(message);
  }

  function safePostMessage(target: Worker, message: WorkerMessage) {
    try {
      target.postMessage(message);
      return true;
    }
    catch {
      // Worker likely terminated; avoid unhandled rejection in tool-call handler.
      return false;
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

  function jsonCloneToolValue(value: unknown): unknown {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_key, val) => {
      if (typeof val === 'bigint') {
        const asNumber = Number(val);
        return Number.isSafeInteger(asNumber) ? asNumber : val.toString();
      }
      if (typeof val === 'function') return undefined;
      if (typeof val === 'symbol') return val.toString();

      if (val instanceof Date) return val.toISOString();
      if (val instanceof Map) return Object.fromEntries(val);
      if (val instanceof Set) return Array.from(val);
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      if (typeof ArrayBuffer !== 'undefined') {
        if (val instanceof ArrayBuffer) return Array.from(new Uint8Array(val));
        if (ArrayBuffer.isView(val)) {
          if (val instanceof DataView) {
            return Array.from(new Uint8Array(val.buffer, val.byteOffset, val.byteLength));
          }
          const view = val as unknown as { length?: number; [key: number]: unknown };
          if (typeof view.length === 'number') {
            return Array.from({ length: view.length }, (_, i) => view[i]);
          }
          return Array.from(new Uint8Array(val.buffer, val.byteOffset, val.byteLength));
        }
      }

      if (val && typeof val === 'object') {
        if (seen.has(val)) return '<cycle>';
        seen.add(val);
      }

      return val;
    });
    if (json === undefined) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async function handleToolCall({ id, name, args }: { id: string; name: string; args: unknown }) {
    const w = worker;
    if (!w) return;
    const logResult = logger
      ? (() => {
          const start = performance.now();
          const argsBytes = getArgsBytes(args);
          return (ok: boolean, error?: string, sanitized?: boolean) => {
            const event = {
              type: 'tool-bridge',
              name,
              toolName: name,
              argsBytes,
              durationMs: Math.round(performance.now() - start),
              ok,
              error,
              sanitized: sanitized ? true : undefined,
            };
            try {
              const result = logger(event);
              if (result && typeof (result as Promise<unknown>).catch === 'function') {
                void (result as Promise<unknown>).catch(() => {});
              }
            }
            catch {
              // Logging should be best-effort.
            }
          };
        })()
      : null;
    if (name === 'run_py') {
      safePostMessage(w, {
        type: 'tool-result',
        id,
        ok: false,
        error: 'run_py is not callable from Python',
      });
      logResult?.(false, 'run_py is not callable from Python');
      return;
    }
    if (!toolHandler) {
      safePostMessage(w, {
        type: 'tool-result',
        id,
        ok: false,
        error: 'tool handler not configured',
      });
      logResult?.(false, 'tool handler not configured');
      return;
    }
    try {
      const value = await toolHandler(name, args);
      if (worker !== w) return;
      if (safePostMessage(w, { type: 'tool-result', id, ok: true, value })) {
        logResult?.(true);
      } else {
        // Most common cause here is DataCloneError from a non-serializable tool result.
        // Best-effort: JSON-clone it (dropping functions, cycles) and retry.
        const cloned = jsonCloneToolValue(value);
        if (safePostMessage(w, { type: 'tool-result', id, ok: true, value: cloned })) {
          logResult?.(true, undefined, true);
        } else {
          safePostMessage(w, {
            type: 'tool-result',
            id,
            ok: false,
            error: 'tool result could not be sent (non-cloneable value)',
          });
          logResult?.(false, 'tool result could not be sent (non-cloneable value)');
        }
      }
    }
    catch (error) {
      if (worker !== w) return;
      const message = error instanceof Error ? error.message : String(error);
      safePostMessage(w, { type: 'tool-result', id, ok: false, error: message });
      logResult?.(false, message);
    }
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = workerFactory();
    currentWorkerId = (workerCounter += 1);
    initializedWorkerId = null;
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

  const api = {
    init: async ({ indexURL, packageCacheDir }: { indexURL: string; packageCacheDir?: string }) => {
      const w = ensureWorker();
      const workerIdForInit = currentWorkerId;
      lastInitArgs = { indexURL, packageCacheDir };
      if (initPromise && initWorkerId === workerIdForInit) return initPromise;
      // If the worker changed underneath us (should be rare), drop the stale init promise.
      initPromise = null;
      initReject = null;
      initWorkerId = workerIdForInit;
      initPromise = new Promise<void>((resolve, reject) => {
        initReject = reject;
        const handleMessage = (msg: WorkerResponse) => {
          if (msg.type !== 'init-result') return;
          w.off('message', handleMessage);
          if (msg.ok) {
            initReject = null;
            if (worker === w && currentWorkerId === workerIdForInit) {
              initializedWorkerId = workerIdForInit;
            }
            resolve();
          }
          else {
            initPromise = null;
            initWorkerId = null;
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
    run: async ({ code, context }: { code: string; context?: unknown }) => {
      // Tools call init() explicitly, but we also defend against any path that
      // recreated a worker without re-initializing it (e.g. after a crash).
      if (lastInitArgs && initializedWorkerId !== currentWorkerId) {
        await api.init(lastInitArgs);
      }
      const doRun = async () => {
        const w = ensureWorker();
        const id = randomUUID();
        return new Promise<any>((resolve, reject) => {
          pending.set(id, { resolve, reject });
          w.postMessage({ type: 'run', id, code, context });
        });
      };
      let result = await doRun();
      if (!result.ok && lastInitArgs) {
        if (isNotInitializedError(result.error)) {
          // If the worker accepted a run call without being initialized, force a re-init and retry once.
          initPromise = null;
          initReject = null;
          initWorkerId = null;
          initializedWorkerId = null;
          await api.init(lastInitArgs);
          result = await doRun();
        } else if (isFatalRuntimeError(result.error)) {
          // Pyodide can enter an unrecoverable state while the worker stays alive.
          // Recycle the worker process and retry once.
          await recycleWorker(
            new Error('pyodide runtime reported a fatal failure; recycling worker'),
          );
          await api.init(lastInitArgs);
          result = await doRun();
        }
      }
      return { ok: result.ok, value: result.value, error: result.error };
    },
    shutdown: async () => {
      if (!worker) return;
      if (initReject || initPromise) {
        initReject?.(new Error('pyodide init canceled by shutdown'));
      }
      worker.postMessage({ type: 'shutdown' });
      await worker.terminate();
      worker = null;
      currentWorkerId = 0;
      initReject = null;
      initPromise = null;
      initWorkerId = null;
      initializedWorkerId = null;
    },
  };
  return api;
}
