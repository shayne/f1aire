# Python VM Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Pyodide-based Python VM robust (clone-safe boundaries), self-healing (structured errors + retries), and prompt-steered (single-call fetch+compute).

**Architecture:** `run_py` returns `{ ok, value|error, hint? }` and never throws; `call_tool` converts JS results to native Python; every worker boundary validates structured-clone safety; agent gets enough tool steps to retry Python when it fails.

**Tech Stack:** Node worker_threads, Pyodide 0.29.x, TypeScript, Zod, Vitest.

---

### Task 1: Make `run_py` return a structured result (no throws)

**Files:**
- Modify: `src/agent/run-py.ts`
- Modify: `src/agent/tools.ts`
- Test: `src/agent/run-py.test.ts`
- Test: `src/agent/tools.test.ts`

**Step 1: Write failing tests**

- `runPy` should return `{ ok: true, value }` instead of raw value.
- `tools.run_py.execute` should return `{ ok: false, error }` when the runtime reports failure, and must not throw.

**Step 2: Run tests**

Run: `npm test`
Expected: FAIL (old API throws / returns raw value)

**Step 3: Implement**

- Update `runPy` to return a discriminated union `{ ok: true, value } | { ok: false, error }`.
- Update `tools.run_py.execute` to:
  - Validate code/vars
  - Initialize runtime
  - Return `{ ok, value|error, hint? }`
  - Retry once on "pyodide is not initialized"

**Step 4: Verify**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

`git commit -m "fix: make run_py structured and self-healing"`

---

### Task 2: Increase tool-step budget for retries

**Files:**
- Modify: `src/agent/engineer.ts`
- Test: `src/agent/engineer.test.ts`

**Step 1: Write failing test**

Assert `stopWhen` stops at 8 steps (not 5).

**Step 2: Run test**

Run: `npm test -- src/agent/engineer.test.ts`
Expected: FAIL

**Step 3: Implement**

Change `stepCountIs(5)` to `stepCountIs(8)` and add a short comment explaining retry headroom.

**Step 4: Verify**

Run: `npm test -- src/agent/engineer.test.ts`
Expected: PASS

**Step 5: Commit**

`git commit -m "fix: allow more tool steps for retries"`

---

### Task 3: Bulletproof worker `run-result` posting

**Files:**
- Modify: `src/agent/pyodide/worker.ts`
- Test: `src/agent/pyodide/worker.test.ts`

**Step 1: Write failing test**

Add `ensureStructuredCloneable` tests that prove non-cloneable values are sanitized before crossing a worker boundary.

**Step 2: Run test**

Run: `npm test -- src/agent/pyodide/worker.test.ts`
Expected: FAIL

**Step 3: Implement**

- Add `ensureStructuredCloneable(value)` helper.
- Use it before posting `run-result.value`.

**Step 4: Verify**

Run: `npm test -- src/agent/pyodide/worker.test.ts`
Expected: PASS

**Step 5: Commit**

`git commit -m "fix: ensure pyodide run results are structured-clone safe"`

---

### Task 4: Prompt contract updates

**Files:**
- Modify: `src/agent/prompt.ts`
- Test: `src/agent/prompt.test.ts`

**Step 1: Implement prompt changes**

- Document `run_py` structured return type.
- Explicitly instruct:
  - Fetch inside Python via `call_tool`.
  - Retry up to 2 times when `run_py.ok === false`.
  - Prefer single `run_py` call for fetch+compute.

**Step 2: Verify**

Run: `npm test -- src/agent/prompt.test.ts`
Expected: PASS

**Step 3: Commit**

`git commit -m "docs: update python prompt contract for retries"`

---

## Final Verification

Run:
- `npm test`
- `npm run build`

Expected: PASS

