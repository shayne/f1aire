# Pyodide Runtime Design (F1aire)

Date: 2026-02-03
Status: Draft

## Summary
Replace the JS VM (`run_js`) with a Pyodide-based Python runtime embedded in the Node CLI. The runtime is notebook-style (stateful per chat session), ships with a pinned Pyodide distribution and a default scientific stack, and is transparent to users beyond a first-run download.

## Goals
- Replace the JS/TS sandbox with Python execution for agent computations.
- Use a long-lived, notebook-style Python environment per chat session.
- Provide a default scientific stack (numpy, pandas, scipy, scikit-learn, statsmodels).
- Keep all runtime assets in XDG-style app directories (no system pollution).
- Seamless UX for `npx f1aire` (first-run download + progress UI).

## Non-goals
- Strong sandboxing or isolation beyond a worker boundary.
- Support for native CPython extensions outside Pyodide/WASM packages.
- Visualizations in Python (no plotting libraries by default).

## Constraints & Assumptions
- Node.js minimum version: 24 (lowest supported version).
- Pyodide version pinned to 0.29.3.
- WASM-only package constraints are acceptable.
- No runtime package installs beyond the pinned distribution.

## Decisions
1. **Runtime choice**: Use Pyodide embedded in Node instead of CPython/uv.
2. **Execution model**: Long-lived worker thread per chat session.
3. **Dependency model**: Use Pyodide full distribution and `loadPackage()` for built-in scientific packages.
4. **Data bridge**: JSON/JS bridge via `pyodide.toPy()` and `registerJsModule()`.

## Architecture
### Bootstrap / First-run
- On startup, verify Node >= 24 and show a friendly error if too old.
- Ensure Pyodide assets are present under the app data directory:
  - macOS/Linux: `$XDG_DATA_HOME/f1aire/pyodide/0.29.3/`
  - Windows: `%LOCALAPPDATA%\f1aire\pyodide\0.29.3\`
- If missing, download the Pyodide “full” tarball and extract it into the versioned directory.
- Show progress UI and expected download size.

### Runtime hosting
- Spawn a `worker_threads` worker to host the Pyodide runtime.
- Initialize Pyodide once with `loadPyodide({ indexURL, packageCacheDir })`.
- Preload the default packages with `pyodide.loadPackage()`.
- Keep `pyodide.globals` stable for notebook-style persistence.

### Tool interface
- Replace `run_js` with `run_py` in `src/agent/tools.ts`.
- `run_py` accepts `{ code, inputs }` and returns `{ ok, value, logs, error }`.
- Results must be JSON-serializable; provide guidance for NumPy/pandas conversion.

### Data bridge
- Inject stable globals into Python:
  - `store`, `processors`, `raw`, `helpers`, `analysis` (via `pyodide.toPy()` for JSON data).
- Register a JS module (`engine`) via `registerJsModule()` to expose live data methods:
  - `engine.get_latest`, `engine.get_lap_table`, `engine.inspect_topic`, etc.
- Prefer JS module calls for large or dynamic data to avoid heavy copies.

### Prompt updates
- Replace “Engineer JS Skill” section with “Engineer Python Skill.”
- Document persistence semantics and approved globals/modules.
- Provide examples for common operations and conversion to JSON-friendly outputs.

## Error Handling
- Wrap `run_py` in a timeout; on timeout, terminate worker and recreate it.
- Return structured tracebacks for developer visibility; present short user-facing errors.
- If runtime init fails, show a diagnostic screen before chat.

## UX
- First-run: prompt for Pyodide download with size estimate and progress.
- Subsequent runs: fast startup with cached runtime assets.
- If download fails: show retry + network/storage diagnostics.

## Testing
- Unit test the Python runner wrapper (mock worker, validate request/response).
- Integration test for first-run download and initialization flow (mock file system + download).
- Smoke test for `run_py` executing a simple NumPy computation.

## Migration
- Remove `run-js.ts` and replace references with `run-py.ts`.
- Update system prompt and tool registry.
- Update documentation (README, usage notes).

## Open Questions
- None.
