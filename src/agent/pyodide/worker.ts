import { randomUUID } from 'node:crypto';
import { parentPort } from 'node:worker_threads';
import { loadPyodide } from 'pyodide';
import { buildPythonBridgePrelude } from './python-bridge.js';
import type { WorkerMessage } from './protocol.js';

let pyodide: Awaited<ReturnType<typeof loadPyodide>> | null = null;
const pendingToolCalls = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

function rejectPendingToolCalls(error: Error) {
  for (const { reject } of pendingToolCalls.values()) {
    reject(error);
  }
  pendingToolCalls.clear();
}

function registerToolBridge() {
  pyodide?.registerJsModule('tool_bridge', {
    callTool: (name: string, args: unknown) => {
      if (!parentPort) {
        return Promise.reject(new Error('tool bridge unavailable'));
      }
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        pendingToolCalls.set(id, { resolve, reject });
        parentPort.postMessage({ type: 'tool-call', id, name, args });
      });
    },
  });
}

async function installPythonBridge() {
  if (!pyodide) return;
  const prelude = buildPythonBridgePrelude();
  await pyodide.runPythonAsync(prelude);
}

parentPort?.on('message', async (msg: WorkerMessage) => {
  if (msg.type === 'tool-result') {
    const pending = pendingToolCalls.get(msg.id);
    if (pending) {
      pendingToolCalls.delete(msg.id);
      if (msg.ok) {
        pending.resolve(msg.value ?? null);
      }
      else {
        pending.reject(new Error(msg.error ?? 'tool call failed'));
      }
    }
    return;
  }
  if (msg.type === 'reset' || msg.type === 'shutdown') {
    pyodide = null;
    rejectPendingToolCalls(new Error('pyodide worker reset'));
    return;
  }
  if (msg.type === 'init') {
    try {
      pyodide = await loadPyodide({ indexURL: msg.indexURL, packageCacheDir: msg.packageCacheDir });
      registerToolBridge();
      await installPythonBridge();
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
        const contextProxy = pyodide.toPy(msg.context);
        try {
          pyodide.globals.set('context', contextProxy);
        } finally {
          contextProxy.destroy();
        }
      }
      const value = await pyodide.runPythonAsync(msg.code);
      let result = value ?? null;
      if (value && typeof value === 'object' && typeof (value as { toJs?: unknown }).toJs === 'function') {
        const proxy = value as { toJs: (opts?: unknown) => unknown; destroy?: () => void };
        result = proxy.toJs({ dict_converter: Object });
        proxy.destroy?.();
      }
      parentPort?.postMessage({
        type: 'run-result',
        id: msg.id,
        ok: true,
        value: result,
      });
    } catch (err: any) {
      parentPort?.postMessage({ type: 'run-result', id: msg.id, ok: false, error: String(err?.message ?? err) });
    }
  }
});
