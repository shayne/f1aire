import { describe, it, expect } from 'vitest';
import { Worker as NodeWorker } from 'node:worker_threads';
import { resolveWorkerSpec } from './client.js';

describe('pyodide worker startup', () => {
  it('starts without module resolution errors in dev (tsx) mode', async () => {
    const spec = resolveWorkerSpec();
    const worker = new NodeWorker(spec.url, { type: 'module', execArgv: spec.execArgv });

    const error = await new Promise<Error | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 200);
      worker.once('error', (err) => {
        clearTimeout(timer);
        resolve(err instanceof Error ? err : new Error(String(err)));
      });
    });

    await worker.terminate();

    expect(error).toBeNull();
  });
});

