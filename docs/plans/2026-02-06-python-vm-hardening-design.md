# Python VM Hardening Design (Pyodide)

Date: 2026-02-06
Status: Draft

## Problem

The embedded Python runtime is powerful, but the Python<->TypeScript boundary is brittle:

- Tool results/args can contain non-structured-cloneable values and crash at `postMessage` boundaries.
- Pyodide can return `JsProxy` objects into Python, which then breaks common Python patterns (e.g. `.get(...)`).
- Python results can fail conversion back to JS (`ConversionError`) or fail structured clone at the final `run-result`.
- When Python fails, the agent often ends the step sequence without producing text, yielding "No response after tool calls".

We want the system to be resilient by design, not by one-off patches.

## Goals

- Make cross-boundary data transfer "never-crash" and "always-diagnosable".
- Provide stable, simple contracts so the model generates correct Python more often.
- Make failures self-healing: the agent sees structured errors and retries within the same user turn.
- Keep runtime constraints explicit (no `asyncio.run`, no `micropip.install`, WASM-only).

Non-goals: strong sandboxing/isolation, arbitrary pip installs, large dataframe transfer.

## Approaches Considered

1) Strict-only contracts (no retries)
- Pros: simple, predictable.
- Cons: still user-visible failures; agent often stops after tool errors.

2) Contract + self-healing loop (recommended)
- Pros: most failures become "fix + retry" without user involvement; minimal complexity.
- Cons: modest token/cost increase; requires clear tool return contracts.

3) Orchestrator-level auto-repair (second model call)
- Pros: strongest UX if the model ignores error handling.
- Cons: additional complexity and extra model calls; defer until needed.

## Design (Recommended)

### 1) Stable `run_py` tool contract

`run_py` always returns a structured result:

- Success: `{ ok: true, value: <jsonable> }`
- Failure: `{ ok: false, error: <traceback|message>, hint?: <short fix suggestion> }`

This prevents `tool-error` pathways from aborting the model, and gives the model a consistent surface to implement "fix + retry".

### 2) Normalize at every boundary (defense in depth)

We normalize/validate clone-safety at every `postMessage` boundary:

- Python -> JS tool-call args: convert PyProxy to JS and ensure structured-clone safe.
- JS -> Python tool results: if structured cloning fails, JSON-clone and retry; in Python, convert `JsProxy` to native Python via `.to_py()`.
- Python -> JS run result: normalize PyProxy outputs, then ensure structured-clone safe before posting the final result.

### 3) Runtime guardrails + auto-repair

- Block unsupported patterns early with clear errors:
  - `asyncio.run`, `run_until_complete` (WASM stack switching)
  - `micropip.install` (no runtime installs)
- Auto-load allowlisted packages on demand (e.g. `numpy`) when a `ModuleNotFoundError` occurs, then retry once.

### 4) Prompt contract to steer the model

System prompt rules:

- Prefer a single `run_py` call per user question.
- Fetch data from within Python via `await call_tool(...)` (no inline blobs, no `vars` for data).
- If `run_py` returns `{ ok: false, ... }`, fix the code and retry up to 2 times before answering.
- Return small JSON-serializable values only.

### 5) Step budget

Increase the tool-step budget to allow "retry once or twice" without hitting the stop condition.

## Testing Strategy

- Unit tests for:
  - `run_py` returning `{ ok, value|error }` instead of throwing.
  - Step budget allows >= 8 steps.
  - Worker ensures structured-cloneable results before posting.
  - Python bridge converts `JsProxy` results to Python values.

## Open Questions

- If we still observe "No response after tool calls", consider Approach #3 (orchestrator-level auto-repair) as a second layer.

