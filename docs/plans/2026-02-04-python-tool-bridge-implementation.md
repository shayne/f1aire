# Python Tool Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let Python call JS tools via a synchronous `call_tool(name, args)` bridge, avoiding large inlined data and eliminating `vars` from the main workflow.

**Architecture:** Add a worker↔main RPC channel (`tool-call`/`tool-result`), expose a JS module inside Pyodide (`tool_bridge.callTool`), and provide a Python `call_tool` wrapper that blocks on tool results. Main thread resolves tool calls via existing `makeTools`, excluding `run_py`.

**Tech Stack:** Node.js worker_threads, Pyodide 0.29.x, TypeScript, Zod, Vitest.

---

### Task 1: Protocol types for tool bridge

**Files:**
- Modify: `src/agent/pyodide/protocol.ts`
- Test: `src/agent/pyodide/protocol.test.ts` (new)

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { WorkerMessage, WorkerResponse } from './protocol.js';

describe('pyodide protocol', () => {
  it('accepts tool-call and tool-result shapes', () => {
    const msg: WorkerMessage = { type: 'tool-call', id: '1', name: 'get_lap_table', args: {} };
    const res: WorkerResponse = { type: 'tool-result', id: '1', ok: true, value: { rows: [] } };
    expect(msg.type).toBe('tool-call');
    expect(res.type).toBe('tool-result');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/pyodide/protocol.test.ts`
Expected: FAIL (types not exported / missing union members)

**Step 3: Write minimal implementation**

- Add `ToolCallMessage` and `ToolResultMessage` types
- Extend `WorkerMessage` and `WorkerResponse` unions

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/pyodide/protocol.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/pyodide/protocol.ts src/agent/pyodide/protocol.test.ts
git commit -m "feat: add pyodide tool-bridge protocol"
```

---

### Task 2: Main-thread tool handler + tests

**Files:**
- Modify: `src/agent/pyodide/client.ts`
- Modify: `src/agent/pyodide/client.test.ts`

**Step 1: Write the failing test**

```ts
it('handles tool-call from worker and posts tool-result', async () => {
  const worker = new FakeWorker();
  const toolHandler = vi.fn().mockResolvedValue({ ok: 1 });
  const client = createPythonClient({
    workerFactory: () => worker as any,
    toolHandler,
  });

  await client.init({ indexURL: '/tmp/pyodide' });
  worker.emit('message', { type: 'tool-call', id: 'abc', name: 'get_driver_list', args: {} });

  expect(toolHandler).toHaveBeenCalledWith('get_driver_list', {});
  expect(worker.postMessage).toHaveBeenCalledWith({
    type: 'tool-result',
    id: 'abc',
    ok: true,
    value: { ok: 1 },
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/pyodide/client.test.ts`
Expected: FAIL (tool-call not handled)

**Step 3: Write minimal implementation**

- Accept `toolHandler?: (name: string, args: unknown) => Promise<unknown>` in `createPythonClient`.
- On worker message `tool-call`, invoke handler, post `tool-result`.
- Reject `run_py` by name with `{ ok: false, error: 'run_py is not callable from Python' }`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/pyodide/client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/pyodide/client.ts src/agent/pyodide/client.test.ts
git commit -m "feat: handle tool-call messages in pyodide client"
```

---

### Task 3: Worker bridge + Python call_tool helper

**Files:**
- Modify: `src/agent/pyodide/worker.ts`
- Create: `src/agent/pyodide/python-bridge.ts`
- Test: `src/agent/pyodide/python-bridge.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildPythonBridgePrelude } from './python-bridge.js';

describe('python bridge prelude', () => {
  it('defines call_tool and blocks run_py', () => {
    const code = buildPythonBridgePrelude();
    expect(code).toContain('def call_tool');
    expect(code).toContain('run_py');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/pyodide/python-bridge.test.ts`
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

- `buildPythonBridgePrelude()` returns a Python snippet that:
  - imports `tool_bridge` JS module
  - defines `call_tool(name, args=None)`
  - rejects `run_py`
  - calls JS `tool_bridge.callTool` and blocks on the Promise via pyodide sync helper (confirm API; if unavailable, fall back to async version and raise clear error)
- In `worker.ts`, after `loadPyodide`, register `tool_bridge` module and run the prelude to install `call_tool` in globals.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/pyodide/python-bridge.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/pyodide/worker.ts src/agent/pyodide/python-bridge.ts src/agent/pyodide/python-bridge.test.ts
git commit -m "feat: add python call_tool bridge"
```

---

### Task 4: Wire tool handler in makeTools

**Files:**
- Modify: `src/agent/tools.ts`
- Modify: `src/agent/tools.test.ts`

**Step 1: Write the failing test**

```ts
it('tool handler rejects run_py from python', async () => {
  const tools = makeTools({ store, processors, timeCursor: { latest: true }, onTimeCursorChange: () => {} });
  await expect(tools.run_py.execute({ code: 'call_tool("run_py")' } as any)).rejects.toThrow();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/tools.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- Provide `toolHandler` to `createPythonClient` that looks up tools by name.
- Disallow `run_py` in the handler.
- Parse args via each tool’s `inputSchema` before executing.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/tools.ts src/agent/tools.test.ts
git commit -m "feat: wire python tool handler"
```

---

### Task 5: Prompt + logging updates

**Files:**
- Modify: `src/agent/prompt.ts`
- Modify: `src/agent/engineer-logger.ts`
- Modify: `src/app.tsx` (if logging occurs here)
- Test: `src/agent/prompt.test.ts`

**Step 1: Write the failing test**

```ts
it('documents call_tool in system prompt', () => {
  expect(systemPrompt).toContain('call_tool');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/prompt.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- Update prompt to describe `call_tool` and give a short example.
- Add `tool-bridge` log events (name, args size, duration, ok/error).

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/prompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/prompt.ts src/agent/prompt.test.ts src/agent/engineer-logger.ts src/app.tsx
git commit -m "docs: document call_tool and log tool-bridge"
```

---

## Final Verification

Run: `npm test`
Expected: PASS (all tests)

---

Plan complete and saved to `docs/plans/2026-02-04-python-tool-bridge-implementation.md`.

Two execution options:

1) Subagent-Driven (this session)
2) Parallel Session (separate)

Which approach?
