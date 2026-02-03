import { randomUUID } from 'node:crypto';
import type { Worker } from 'node:worker_threads';
import { Worker as NodeWorker } from 'node:worker_threads';
import type { WorkerResponse } from './protocol.js';

export function createPythonClient({
  workerFactory = () => new NodeWorker(new URL('./worker.js', import.meta.url), { type: 'module' }),
}: { workerFactory?: () => Worker } = {}) {
  let worker: Worker | null = null;
  const pending = new Map<string, (value: any) => void>();

  function ensureWorker() {
    if (worker) return worker;
    worker = workerFactory();
    worker.on('message', (msg: WorkerResponse) => {
      if (msg.type === 'init-result') return;
      if (msg.type === 'run-result') {
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      }
    });
    return worker;
  }

  return {
    async init({ indexURL, packageCacheDir }: { indexURL: string; packageCacheDir?: string }) {
      const w = ensureWorker();
      return new Promise<void>((resolve, reject) => {
        w.on('message', (msg: WorkerResponse) => {
          if (msg.type !== 'init-result') return;
          if (msg.ok) resolve();
          else reject(new Error(msg.error ?? 'pyodide init failed'));
        });
        w.postMessage({ type: 'init', indexURL, packageCacheDir: packageCacheDir ?? indexURL });
      });
    },
    async run({ code, context }: { code: string; context?: unknown }) {
      const w = ensureWorker();
      const id = randomUUID();
      const result = await new Promise<any>((resolve) => {
        pending.set(id, resolve);
        w.postMessage({ type: 'run', id, code, context });
      });
      return { ok: result.ok, value: result.value, error: result.error };
    },
    async shutdown() {
      if (!worker) return;
      worker.postMessage({ type: 'shutdown' });
      await worker.terminate();
      worker = null;
    },
  };
}
