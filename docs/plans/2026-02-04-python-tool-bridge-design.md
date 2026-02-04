# Python Tool Bridge Design

Date: 2026-02-04

## Summary

Expose a generic `call_tool(name, args)` API inside the Pyodide runtime so Python code can fetch data directly from the existing JS tools registry. This avoids inlining large data blobs into Python code and reduces tool-call size, while keeping the tool surface identical to the JS tools (excluding `run_py` to prevent recursion). The API is synchronous from Python’s point of view, blocking until the tool result returns.

## Goals

- Provide a single Python API to call any JS tool by name.
- Keep Python code clean: “fetch + compute” without embedding large JSON blobs.
- Prevent recursion (`run_py` not callable).
- Preserve notebook-style persistence in Python.
- Improve observability with bridge timing logs.

## Non-Goals

- Strict sandboxing for Python execution.
- Async-only Python API.
- Exposing JS helper functions directly into Python.

## Architecture

### Components

1) **Main thread tools registry**: existing `makeTools` remains the source of truth.
2) **Pyodide worker**: hosts Python runtime; now registers a JS module `tool_bridge`.
3) **Bridge protocol**: new `tool-call` and `tool-result` message types.

### Data Flow

1) Python calls `call_tool(name, args)`.
2) Python invokes JS `tool_bridge.callTool`, which posts `tool-call` to the main thread.
3) Main thread resolves the tool and executes it.
4) Main thread posts `tool-result` with `{ok, value | error}`.
5) Worker resolves the Promise; Python receives result or raises.

## Python API

```python
# Available globally after init
result = call_tool("get_lap_table", {"driverNumbers": ["4"], "includeSectors": True})
```

Rules:
- `call_tool` is sync/blocking in Python.
- `args` defaults to `{}`.
- Results must be JSON-serializable (dict/list/str/number/bool/None).
- `run_py` is rejected with a clear error.

## Protocol Changes

Add messages to `src/agent/pyodide/protocol.ts`:

- `ToolCallMessage` `{ type: "tool-call"; id: string; name: string; args: unknown }`
- `ToolResultMessage` `{ type: "tool-result"; id: string; ok: boolean; value?: unknown; error?: string }`

Update `WorkerMessage` and `WorkerResponse` unions accordingly.

## Implementation Plan (High Level)

1) **Worker bridge** (`src/agent/pyodide/worker.ts`)
   - Track pending tool calls by `id`.
   - Add `callTool(name, args)` that posts `tool-call` and awaits `tool-result`.
   - Register `tool_bridge` module and expose Python `call_tool` helper.

2) **Main thread handler** (`src/agent/pyodide/client.ts` or `src/agent/tools.ts`)
   - Handle `tool-call` messages: look up tool by name and execute.
   - Reject `run_py`.
   - Post `tool-result` with `ok/value` or `error`.
   - Validate results are structured-cloneable before sending.

3) **Prompt updates** (`src/agent/prompt.ts`)
   - Document `call_tool` and remove “vars” as primary data path.
   - Provide short examples for common data retrieval.

4) **Logging**
   - Add `tool-bridge` events with tool name, args size, duration, ok/error.
   - Warn on slow tool calls (e.g., >5s).

## Testing

- Unit: bridge round-trip from worker to main and back.
- Unit: `call_tool` rejects `run_py`.
- Unit: JSON schema conversions still succeed.
- Prompt test: ensure `call_tool` described in system prompt.

## Risks & Mitigations

- **Sync wrapper**: relies on Pyodide sync-await helper; fallback to async if unavailable.
- **Large results**: still possible; log size and consider later limits.
- **Tool exceptions**: always wrap errors and surface cleanly in Python.

## Open Questions

- Confirm best Pyodide sync-await API for Node worker.
- Decide if we should limit tool result size in v1.
