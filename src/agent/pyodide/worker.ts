import { parentPort } from 'node:worker_threads';
import { loadPyodide } from 'pyodide';
import type { WorkerMessage } from './protocol.js';

let pyodide: Awaited<ReturnType<typeof loadPyodide>> | null = null;

parentPort?.on('message', async (msg: WorkerMessage) => {
  if (msg.type === 'reset' || msg.type === 'shutdown') {
    pyodide = null;
    return;
  }
  if (msg.type === 'init') {
    try {
      pyodide = await loadPyodide({ indexURL: msg.indexURL, packageCacheDir: msg.packageCacheDir });
      parentPort?.postMessage({ type: 'init-result', ok: true });
    } catch (err: any) {
      parentPort?.postMessage({ type: 'init-result', ok: false, error: String(err?.message ?? err) });
    }
  }
  if (msg.type === 'run') {
    if (!pyodide) {
      parentPort?.postMessage({
        type: 'run-result',
        id: msg.id,
        ok: false,
        error: 'pyodide is not initialized',
      });
      return;
    }
    try {
      if (msg.context) {
        pyodide.globals.set('context', pyodide.toPy(msg.context));
      }
      const value = await pyodide.runPythonAsync(msg.code);
      parentPort?.postMessage({
        type: 'run-result',
        id: msg.id,
        ok: true,
        value: value?.toJs?.({ dict_converter: Object }) ?? value ?? null,
      });
    } catch (err: any) {
      parentPort?.postMessage({ type: 'run-result', id: msg.id, ok: false, error: String(err?.message ?? err) });
    }
  }
});
