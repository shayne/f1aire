# Pyodide Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the JS sandbox with a Pyodide-based, notebook-style Python runtime that is ready before the engineer chat starts.

**Architecture:** Download and cache the pinned Pyodide “full” distribution on first run, host Pyodide in a worker thread, and expose a `run_py` tool that executes code with preloaded data helpers and returns JSON-friendly results.

**Tech Stack:** Node.js 24+, TypeScript, worker_threads, Pyodide (npm), vitest.

### Task 1: Pyodide asset paths + downloader

**Files:**
- Create: `src/agent/pyodide/paths.ts`
- Create: `src/agent/pyodide/assets.ts`
- Modify: `package.json`
- Test: `src/agent/pyodide/assets.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { ensurePyodideAssets } from './assets.js';

const tmpRoot = path.join(process.cwd(), '.tmp-pyodide-test');

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<any>('node:fs/promises');
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(new Error('missing')),
    mkdir: vi.fn(),
  };
});

describe('ensurePyodideAssets', () => {
  it('downloads and extracts when assets are missing', async () => {
    const download = vi.fn().mockResolvedValue(path.join(tmpRoot, 'pyodide.tar.bz2'));
    const extract = vi.fn().mockResolvedValue(undefined);

    await ensurePyodideAssets({
      version: '0.29.3',
      baseDir: tmpRoot,
      download,
      extract,
    });

    expect(download).toHaveBeenCalled();
    expect(extract).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/pyodide/assets.test.ts`
Expected: FAIL with "Cannot find module './assets.js'" or missing export.

**Step 3: Write minimal implementation**

`src/agent/pyodide/paths.ts`
```ts
import path from 'node:path';
import { getDataDir } from '../../core/xdg.js';

export const PYODIDE_VERSION = '0.29.3';

export function getPyodideBaseDir() {
  return path.join(getDataDir('f1aire'), 'pyodide', PYODIDE_VERSION);
}

export function getPyodideIndexUrl() {
  return path.join(getPyodideBaseDir(), 'full');
}
```

`src/agent/pyodide/assets.ts`
```ts
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getPyodideBaseDir } from './paths.js';

const DEFAULT_TARBALL = 'pyodide-0.29.3.tar.bz2';
const DEFAULT_URL = `https://github.com/pyodide/pyodide/releases/download/0.29.3/${DEFAULT_TARBALL}`;

export async function ensurePyodideAssets({
  version,
  baseDir = getPyodideBaseDir(),
  download = defaultDownload,
  extract = defaultExtract,
}: {
  version: string;
  baseDir?: string;
  download?: (url: string, destDir: string) => Promise<string>;
  extract?: (tarPath: string, destDir: string) => Promise<void>;
}) {
  const marker = path.join(baseDir, 'full', 'index.html');
  try {
    await fs.access(marker);
    return { ready: true };
  } catch {
    await fs.mkdir(baseDir, { recursive: true });
    const tarPath = await download(DEFAULT_URL, baseDir);
    await extract(tarPath, baseDir);
    return { ready: true };
  }
}

async function defaultDownload(url: string, destDir: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const filePath = path.join(destDir, 'pyodide.tar.bz2');
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buf);
  return filePath;
}

async function defaultExtract(tarPath: string, destDir: string) {
  const { extract } = await import('tar');
  await extract({ file: tarPath, cwd: destDir });
}
```

`package.json` (add dependencies)
```json
"dependencies": {
  "pyodide": "^0.29.3",
  "tar": "^7.4.0",
  ...
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/pyodide/assets.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/pyodide/paths.ts src/agent/pyodide/assets.ts src/agent/pyodide/assets.test.ts package.json package-lock.json
git commit -m "feat: add pyodide asset bootstrap"
```

### Task 2: Pyodide worker + client runtime

**Files:**
- Create: `src/agent/pyodide/protocol.ts`
- Create: `src/agent/pyodide/worker.ts`
- Create: `src/agent/pyodide/client.ts`
- Test: `src/agent/pyodide/client.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createPythonClient } from './client.js';

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
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/pyodide/client.test.ts`
Expected: FAIL with "Cannot find module './client.js'".

**Step 3: Write minimal implementation**

`src/agent/pyodide/protocol.ts`
```ts
export type InitMessage = { type: 'init'; indexURL: string; packageCacheDir: string };
export type RunMessage = { type: 'run'; id: string; code: string; context?: unknown };
export type ResetMessage = { type: 'reset' };
export type ShutdownMessage = { type: 'shutdown' };

export type WorkerMessage = InitMessage | RunMessage | ResetMessage | ShutdownMessage;

export type InitResult = { type: 'init-result'; ok: boolean; error?: string };
export type RunResult = { type: 'run-result'; id: string; ok: boolean; value?: unknown; error?: string };

export type WorkerResponse = InitResult | RunResult;
```

`src/agent/pyodide/client.ts`
```ts
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
```

`src/agent/pyodide/worker.ts`
```ts
import { parentPort } from 'node:worker_threads';
import { loadPyodide } from 'pyodide';
import type { WorkerMessage } from './protocol.js';

let pyodide: Awaited<ReturnType<typeof loadPyodide>> | null = null;

parentPort?.on('message', async (msg: WorkerMessage) => {
  if (msg.type === 'init') {
    try {
      pyodide = await loadPyodide({ indexURL: msg.indexURL, packageCacheDir: msg.packageCacheDir });
      parentPort?.postMessage({ type: 'init-result', ok: true });
    } catch (err: any) {
      parentPort?.postMessage({ type: 'init-result', ok: false, error: String(err?.message ?? err) });
    }
  }
  if (msg.type === 'run' && pyodide) {
    try {
      if (msg.context) {
        pyodide.globals.set('context', pyodide.toPy(msg.context));
      }
      const value = await pyodide.runPythonAsync(msg.code);
      parentPort?.postMessage({ type: 'run-result', id: msg.id, ok: true, value: value?.toJs?.({ dict_converter: Object }) ?? value ?? null });
    } catch (err: any) {
      parentPort?.postMessage({ type: 'run-result', id: msg.id, ok: false, error: String(err?.message ?? err) });
    }
  }
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/pyodide/client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/pyodide/protocol.ts src/agent/pyodide/worker.ts src/agent/pyodide/client.ts src/agent/pyodide/client.test.ts
git commit -m "feat: add pyodide worker runtime"
```

### Task 3: run_py tool + prompt updates

**Files:**
- Create: `src/agent/run-py.ts`
- Modify: `src/agent/tools.ts`
- Modify: `src/agent/prompt.ts`
- Modify: `src/agent/prompt.test.ts`
- Remove: `src/agent/run-js.ts`
- Remove: `src/agent/run-js.test.ts`

**Step 1: Write the failing test**

`src/agent/run-py.test.ts`
```ts
import { describe, it, expect, vi } from 'vitest';
import { runPy } from './run-py.js';

const fakeClient = {
  run: vi.fn().mockResolvedValue({ ok: true, value: { answer: 2 } }),
};

describe('runPy', () => {
  it('forwards code to python runtime', async () => {
    const result = await runPy({ code: '1+1', context: { a: 1 }, runtime: fakeClient as any });
    expect(fakeClient.run).toHaveBeenCalled();
    expect(result).toEqual({ answer: 2 });
  });
});
```

Update `src/agent/prompt.test.ts`
```ts
expect(systemPrompt).toContain('Engineer Python Skill');
expect(systemPrompt).toContain('run_py');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/run-py.test.ts src/agent/prompt.test.ts`
Expected: FAIL with missing `run-py`.

**Step 3: Write minimal implementation**

`src/agent/run-py.ts`
```ts
import { createPythonClient } from './pyodide/client.js';

export async function runPy({
  code,
  context,
  runtime = createPythonClient(),
}: {
  code: string;
  context: Record<string, unknown>;
  runtime?: { run: (opts: { code: string; context?: unknown }) => Promise<{ ok: boolean; value?: unknown; error?: string }> };
}) {
  const result = await runtime.run({ code, context });
  if (!result.ok) throw new Error(result.error ?? 'Python execution failed');
  return result.value ?? null;
}
```

Update `src/agent/tools.ts` to use `run_py` tool and remove `run_js`.

Update `src/agent/prompt.ts` to:
- Replace “Engineer JS Skill” with “Engineer Python Skill”
- Update examples to Python
- Document notebook-style persistence and JSON output constraints

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/run-py.test.ts src/agent/prompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/run-py.ts src/agent/run-py.test.ts src/agent/tools.ts src/agent/prompt.ts src/agent/prompt.test.ts
git rm src/agent/run-js.ts src/agent/run-js.test.ts
git commit -m "feat: replace run_js with run_py"
```

### Task 4: Startup preflight + UX

**Files:**
- Create: `src/tui/screens/RuntimePreparing.tsx`
- Modify: `src/app.tsx`
- Modify: `README.md`
- Test: `src/tui/screens/RuntimePreparing.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RuntimePreparing } from './RuntimePreparing.js';

describe('RuntimePreparing', () => {
  it('renders progress text', () => {
    const { lastFrame } = render(<RuntimePreparing message="Preparing Python runtime" />);
    expect(lastFrame()).toContain('Preparing Python runtime');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tui/screens/RuntimePreparing.test.tsx`
Expected: FAIL missing component.

**Step 3: Write minimal implementation**

`src/tui/screens/RuntimePreparing.tsx`
```tsx
import React from 'react';
import { Text, Box } from 'ink';
import { Panel } from '../components/Panel.js';

export function RuntimePreparing({ message }: { message: string }) {
  return (
    <Panel title="Python Runtime">
      <Box flexDirection="column" gap={1}>
        <Text>{message}</Text>
        <Text>First run may download ~200MB of assets.</Text>
      </Box>
    </Panel>
  );
}
```

`src/app.tsx` (add boot state)
```ts
const [runtimeReady, setRuntimeReady] = useState(false);
const [runtimeMessage, setRuntimeMessage] = useState('Checking Python runtime...');

useEffect(() => {
  let cancelled = false;
  void (async () => {
    setRuntimeMessage('Preparing Python runtime...');
    await ensurePyodideAssets({ version: '0.29.3', onProgress: (msg) => setRuntimeMessage(msg) });
    if (!cancelled) setRuntimeReady(true);
  })();
  return () => { cancelled = true; };
}, []);
```

Render `RuntimePreparing` when `!runtimeReady` before any other screen.

Update `README.md` with a note about first-run Pyodide download.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tui/screens/RuntimePreparing.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/screens/RuntimePreparing.tsx src/tui/screens/RuntimePreparing.test.tsx src/app.tsx README.md
git commit -m "feat: add pyodide preflight UI"
```
