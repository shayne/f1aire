# F1aire AI Race Engineer Design

Date: 2026-02-01

## Goal
Add an AI race engineer chat experience that activates immediately after a session download completes. The engineer answers plain‑English questions about the currently loaded event/session using raw timing data and derived state, with streaming responses.

## Non‑Goals (for this phase)
- Persistent chat history on disk.
- Multi‑event comparisons or cross‑season analytics.
- Safety hardening or sandbox limits for JS execution.
- Full telemetry UI (graphs/plots) beyond text explanations.

## Decisions / Constraints
- Provider: OpenAI only, model `gpt-5.2-codex`.
- Runtime: Node.js + TypeScript.
- UI: Ink TUI; Gemini‑style chat screen.
- Trigger: chat screen shows immediately after session download.
- Data scope: any session (Practice/Sprint/Quali/Race). In-memory only.
- Execution: JS VM is unrestricted; must be Turing‑complete and access raw data.

## Architecture Overview
```
TUI (Ink) ──► Download ──► Parse/Store ──► AI Engineer Chat (streaming)
                          ▲                    │
                          │                    ▼
                     Processors            Tools + JS VM
```

### New Modules
- `src/agent/engineer.ts`: chat orchestration (AI SDK stream + tool registry).
- `src/agent/prompt.ts`: system prompt + “Engineer JS Skill” description.
- `src/agent/tools/*`: tool wrappers around processors + `runJs`.
- `src/core/session-store.ts`: canonical raw store; topic timelines; helpers.
- `src/core/processors/*`: per‑topic processors with `latest` + derived indices.
- `src/tui/screens/EngineerChat.tsx`: chat UI (history + input + streaming).

## Data Ingestion & Store
We reuse existing download artifacts:
- `subscribe.json`: initial state snapshots
- `live.jsonl`: `RawTimingDataPoint` stream

### Parsing
- Parse `live.jsonl` entries into `(type, json, dateTime)`.
- Decompress `.z` topics (e.g., `CarData.z`, `Position.z`) from base64+deflate.
- Normalize known arrays to dictionaries for consistent access.

### Canonical Store
`SessionStore` provides:
- `topic(name).latest`: last snapshot
- `topic(name).timeline(from?, to?)`: time‑ordered data points
- `raw`: raw `subscribe.json` and `live.jsonl` line access

## Processor Layer (undercut‑f1 pattern)
Each processor maintains `latest` and optional derived indices:
- `TimingDataProcessor`: positions, gaps, best laps, driver lap history
- `TimingAppDataProcessor`: stints/tyres
- `TimingStatsProcessor`: best speeds
- `DriverListProcessor`: driver metadata
- `SessionInfoProcessor`: session metadata
- `LapCountProcessor`, `TrackStatusProcessor`, `WeatherProcessor`
- `CarDataProcessor`, `PositionProcessor`
- `RaceControlMessagesProcessor`, `TeamRadioProcessor`
- `PitStopSeriesProcessor`, `PitLaneTimeCollectionProcessor`
- `HeartbeatProcessor`, `ExtrapolatedClockProcessor`

Processors are fed by a `TimingService` that routes each data point.

## Tools & JS VM
### Tools
LLM tools are thin wrappers over store + processors:
- `get_latest(topic)`
- `get_timing_snapshot(ts?)`
- `get_driver_list()`
- `get_driver(driverNumber)`
- `get_lap_times(driverNumber)`
- `get_stints(driverNumber)`
- `run_js(code)`

### JS VM
`run_js` executes in a Node `vm` context with globals:
- `store`: `SessionStore`
- `processors`: all processors
- `raw`: direct access to raw `subscribe.json` + `live.jsonl`
- `require`, `fetch`, `console`

No sandbox limits or restrictions are enforced for this phase.

### Engineer JS Skill
Embedded in `system` prompt and in `run_js` description:
- Lists globals and expected structures.
- Shows 3–4 examples (lap delta, best lap compare, stint length).

## Agent
- AI SDK (`ai`) with `@ai-sdk/openai` provider.
- Model: `openai('gpt-5.2-codex')`.
- Use `streamText` for token streaming into the TUI.
- Provide tools to the model; tool calling preferred for data access; `run_js` for bespoke analysis.
- System prompt enforces “race engineer” tone, evidence‑first reasoning, and clear uncertainty when data is insufficient.

## UI/UX
- New screen `EngineerChat` replaces Summary after download.
- Layout: chat history + streaming assistant + input line.
- Hotkeys: `b`/Esc back to session picker, `q` quit.
- In‑memory history only; resets on session change.

## Error Handling
- Missing data: tools return structured error; model instructed to acknowledge gaps.
- Tool failures: surface error line in chat and allow retry.
- API errors: show a status banner and fall back to non‑AI summary.

## Testing
- Unit tests for store parsing + processor outputs.
- Tool wrapper tests with mock store/processor data.
- Prompt “skill” snapshot test (ensures skill content present).
- Minimal integration test: run `EngineerChat` with a stubbed agent stream.

## Implementation Notes
- Reuse existing summary parsing where possible.
- Keep prompt modular for iteration.
- Ensure VM execution runs in‑process and is async‑safe.
