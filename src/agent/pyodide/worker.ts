import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';
import type { WorkerMessage } from './protocol.js';

let pyodide: Awaited<ReturnType<typeof loadPyodide>> | null = null;
const pendingToolCalls = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

type PyProxyLike = {
  toJs: (opts?: unknown) => unknown;
  destroy?: () => void;
};

function resolvePythonBridgeModuleUrl(baseUrl: string | URL = import.meta.url) {
  const jsUrl = new URL('./python-bridge.js', baseUrl);
  if (fs.existsSync(fileURLToPath(jsUrl))) {
    return jsUrl;
  }
  return new URL('./python-bridge.ts', baseUrl);
}

function rejectPendingToolCalls(error: Error) {
  for (const { reject } of pendingToolCalls.values()) {
    reject(error);
  }
  pendingToolCalls.clear();
}

function isPyProxyLike(value: unknown): value is PyProxyLike {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof (value as any).toJs === 'function',
  );
}

function isConversionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('pyodide.ffi.ConversionError')
    || message.includes('No conversion known for x')
  );
}

export async function normalizePythonResultForPostMessage({
  pyodideInstance,
  value,
}: {
  pyodideInstance: Awaited<ReturnType<typeof loadPyodide>>;
  value: unknown;
}): Promise<unknown> {
  if (!isPyProxyLike(value)) return value ?? null;

  const proxy = value;
  try {
    try {
      return proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
    } catch (error) {
      if (!isConversionError(error)) throw error;

      // Best-effort: convert non-JSONable values (range, generators, etc) to
      // JSON-friendly structures in Python, then convert to a clone-safe JS value.
      pyodideInstance.globals.set('__f1aire_result', proxy as any);
      let normalized: unknown = null;
      try {
        normalized = await pyodideInstance.runPythonAsync('__f1aire_to_jsonable(__f1aire_result)');
      } finally {
        try {
          (pyodideInstance.globals as any).delete?.('__f1aire_result');
        } catch {
          // Best-effort cleanup.
        }
      }

      if (!isPyProxyLike(normalized)) return normalized ?? null;

      const normalizedProxy = normalized;
      try {
        return normalizedProxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
      } finally {
        normalizedProxy.destroy?.();
      }
    }
  } finally {
    proxy.destroy?.();
  }
}

export function normalizeToolArgsForPostMessage(args: unknown): unknown {
  if (!args || typeof args !== 'object') return args;
  const maybeProxy = args as {
    toJs?: (opts?: unknown) => unknown;
    copy?: () => unknown;
    destroy?: () => void;
  };
  if (typeof maybeProxy.toJs !== 'function') return args;

  // Tool-call args arrive as borrowed proxies when Python calls into JS.
  // In Pyodide's Node runtime, explicitly destroying a borrowed proxy can
  // trigger a fatal "Object has already been destroyed" error inside proxy GC.
  //
  // If copy() exists, use it so we can safely destroy the owned proxy without
  // touching the borrowed one.
  const owned =
    typeof maybeProxy.copy === 'function' ? (maybeProxy.copy() as any) : maybeProxy;
  try {
    const converted = (owned as any).toJs({
      dict_converter: Object.fromEntries,
      create_pyproxies: false,
    });
    return converted;
  } catch {
    // Avoid crashing the bridge on conversion failures; the tool handler will
    // surface invalid args (typically via Zod) with a clearer error than DataCloneError.
    return {};
  } finally {
    if (owned !== maybeProxy) {
      try {
        owned.destroy?.();
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

function registerToolBridge() {
  pyodide?.registerJsModule('tool_bridge', {
    callTool: (name: string, args: unknown) => {
      const port = parentPort;
      if (!port) {
        return Promise.reject(new Error('tool bridge unavailable'));
      }
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        pendingToolCalls.set(id, { resolve, reject });
        try {
          const safeArgs = normalizeToolArgsForPostMessage(args);
          port.postMessage({ type: 'tool-call', id, name, args: safeArgs });
        } catch (err) {
          pendingToolCalls.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
  });
}

async function installPythonBridge() {
  if (!pyodide) return;
  const bridgeUrl = resolvePythonBridgeModuleUrl();
  const bridgeModule = await import(bridgeUrl.href);
  if (typeof bridgeModule.buildPythonBridgePrelude !== 'function') {
    throw new Error('python bridge module is missing buildPythonBridgePrelude');
  }
  const prelude = bridgeModule.buildPythonBridgePrelude();
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
      const result = await normalizePythonResultForPostMessage({
        pyodideInstance: pyodide,
        value,
      });
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
