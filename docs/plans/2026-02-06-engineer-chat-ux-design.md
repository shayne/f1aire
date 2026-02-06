# Engineer Chat UX Fixes (Design)

## Goals
- Fix conversation scroll corruption and partial-word artifacts by making line measurement match the rendered output.
- Reduce flicker by eliminating unnecessary spinners and minimizing right-pane re-render churn.
- Add a Python code preview panel that shows the generated `run_py` code while it’s being written, cropped to available height in the right pane.
- Keep the UI fast and deterministic without heavy virtualization.

## UX Changes
- **Conversation panel rendering:** Pre-render assistant Markdown to terminal text at the actual content width, then render that text directly. Use the same rendered string for line-counting so visible message slicing matches what’s on screen.
- **Activity panel:** Remove the spinner and treat Activity as a simple log list (last N entries). Keep “Idle” when nothing else is available.
- **Code preview panel:** Add a “Python” (or “Code”) panel to the right pane that displays the most recent `run_py` code being generated. It should be cropped to fit the available space (show last N lines). Update it when tool-input events for `run_py` occur.

## Technical Approach
- **Markdown rendering:** Use `marked` + `marked-terminal` to render assistant content to plain text with a specified width. Use a shared helper to render and count lines. Avoid relying on `@inkkit/ink-markdown` for line estimation.
- **Right pane layout:** Extend `fitRightPane` to allocate space for the new code panel after session/activity panels. Use panel overhead + available line budget to decide how many code lines to show.
- **Code preview state:** Track `codePreview` in `App` and update it on tool-input events for `run_py`. Extract code from the tool input payload (args.code) when available; use deltas if provided. Clear on send-start.

## Data Flow
- `App` listens to `stream-part` events:
  - On `send-start`: clear `codePreview`.
  - On `tool-input-start`/`tool-input-delta` for `run_py`: update `codePreview`.
- `EngineerChat` receives `codePreview`, wraps it to right-pane width, and displays the last N lines in the Code panel.

## Tests
- Add tests to ensure the prompt updates still render without literal markdown markers.
- Add a `bridge-loader` test already exists for runtime JS/TS resolution.
- Add tests that the code preview panel renders when code is provided (and remains hidden when empty).
- Add tests to ensure activity panel does not display a spinner.

---

If this design looks good, proceed with implementation using TDD.
