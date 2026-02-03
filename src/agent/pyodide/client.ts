import { randomUUID } from 'node:crypto';
import type { Worker } from 'node:worker_threads';
import { Worker as NodeWorker } from 'node:worker_threads';
import type { WorkerResponse } from './protocol.js';

export function createPythonClient({
  workerFactory = () => new NodeWorker(new URL('./worker.js', import.meta.url), { type: 'module' }),
}: { workerFactory?: () => Worker } = {}) {
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

  function ensureWorker() {
    if (worker) return worker;
    worker = workerFactory();
    worker.on('message', (msg: WorkerResponse) => {
      if (msg.type === 'init-result') return;
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
        w.postMessage({ type: 'init', indexURL, packageCacheDir: packageCacheDir ?? indexURL });
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
      worker.postMessage({ type: 'shutdown' });
      await worker.terminate();
      worker = null;
      initPromise = null;
    },
  };
}
