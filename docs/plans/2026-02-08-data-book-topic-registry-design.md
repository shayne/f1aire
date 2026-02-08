# F1aire DataBook + Topic Registry Design

Date: 2026-02-08

## Goal
Make `f1aire` a better AI race engineer by giving the agent a first-class “information architecture” (IA) map of all live timing data we can download for a session:

- What each topic is for (definition + engineer use cases).
- How each topic updates (patch vs replace vs batched/append).
- Units/format conventions and common pitfalls.
- Small, session-backed example snippets on demand.
- Proof of coverage: what we attempted to download and what we actually have.

## Non-Goals (for v1)
- Full field-by-field schema documentation for every nested property in every topic.
- Live SignalR client (authenticated streaming) or account/session-cookie handling.
- Telemetry plotting/visualization UI.
- Cross-event/season comparisons.

## Current State (Key Observations)
- `src/core/download.ts` downloads a fixed set of topics for a completed session path and writes `live.jsonl` + `subscribe.json`.
- `src/core/processors/normalize.ts` already handles key normalization:
  - Inflate `.z` topics (base64+deflate).
  - Strip `_kf`.
  - Convert arrays to indexed dictionaries where the API is inconsistent (`TimingData.Sectors/Segments`, `TimingAppData.Stints`, `RaceControlMessages.Messages`, `TeamRadio.Captures`, etc).
- The agent already has strong “shape discovery” tools (`inspect_topic`, `get_data_catalog`, `get_topic_timeline`), but no curated semantics map.

## Proposed Architecture (High Level)
Add two new concepts:

1. **Topic Registry**: canonical list of topics + metadata used by the downloader and DataBook.
2. **DataBook**: curated, machine-readable topic reference describing meaning, key fields, pitfalls, and engineer usage; plus bounded session-backed examples.

The agent prompt is tuned to use these first before doing bespoke analysis.

## Topic Registry
Create a single source of truth for known topics (initially matching what we already download):

- `Heartbeat`
- `CarData.z`
- `Position.z`
- `ExtrapolatedClock`
- `TopThree`
- `TimingStats`
- `TimingAppData`
- `WeatherData`
- `TrackStatus`
- `DriverList`
- `RaceControlMessages`
- `SessionData`
- `LapCount` (race only)
- `TimingData`
- `ChampionshipPrediction` (race only)
- `TeamRadio`
- `PitLaneTimeCollection`
- `PitStopSeries`
- `PitStop`
- `SessionInfo` (handled as initial snapshot today, not in `live.jsonl`)

Topic registry metadata should include:
- `topic`: canonical topic name.
- `streamName`: name used in `{topic}.jsonStream` (includes `.z` for compressed topics).
- `aliases`: e.g. `CarData` vs `CarData.z` (canonical vs wire name).
- `sessionAvailability`: `race-only` | `all-sessions` (best-effort; real availability is per session).
- `updateSemantics`: `patch` | `replace` | `batched` (e.g. `CarData` and `Position` contain `Entries` batches).
- `notes`: short human-readable constraints.

## Downloader Changes (Best Effort + Manifest)
Refactor `downloadSession()` to:

1. Use the Topic Registry to decide which topics to attempt.
2. Download topics **best-effort**:
   - Missing topic should not abort the whole download.
   - Record failures per topic (status code, timeout, parse errors).
3. Emit a **download manifest** `download.json` alongside `live.jsonl` and `subscribe.json`:
   - `startUtc` and how it was computed.
   - `topicsAttempted`: list.
   - `topics`: per topic result `{ ok, statusCode?, error?, bytes?, points? }`.

The manifest is how we verify “we tried everything we know about,” while `get_data_catalog()` remains the truth for “what we actually have in the timeline.”

## DataBook (Structured, Machine-Usable)
Add `src/agent/data-book/` containing structured topic reference data (TypeScript objects).

Each entry is intentionally curated and short:

- `topic` + `aliases` (including `.z` where relevant).
- `purpose`: 1–3 sentences.
- `engineerUse`: what questions it answers, and which other topics/tools to combine.
- `semantics`: patch vs replace vs batched; merge/normalization rules.
- `keyFields`: small list of “paths that matter,” with units/format notes.
- `pitfalls`: common gotchas that frequently lead to wrong answers.
- `relatedTopics`: cross-links.

### Session-Backed Examples
`get_topic_reference(..., includeExample: true)` returns an `example` object extracted from the currently loaded session data, bounded to a small size target (roughly <= 10KB).

Example extraction should be per-topic and representative:
- `TimingData`: one driver line + leader line; include lap/time fields, gaps/intervals, pit flags, and mini-sector flags (without dumping full history).
- `TrackStatus`: current + last N changes with timestamps.
- `RaceControlMessages`: last N messages sorted by time.
- `CarData`: latest entry; optionally one driver’s channels decoded.
- `Position`: latest entry; optionally one driver’s XYZ.
- `TimingAppData`: one driver’s stints table.

If the topic is missing in this session, return `example: null` and include `present: false`.

## Agent Tools
Add two tools:

- `get_data_book_index()`: list all DataBook topics with a one-line purpose and best “next tool” (e.g. `get_lap_table` for `TimingData`).
- `get_topic_reference({ topic, driverNumber?, includeExample? })`: return `{ found, reference?, present, example? }`.

These tools are designed to be called early to ground the model, and to avoid the model “inventing meaning” from raw shapes.

## Prompting / Workflow Tuning
Update the system prompt to enforce a “DataBook-first” workflow:

1. **Orient**: call `get_data_catalog()` when unsure what data is available.
2. **Learn semantics**: call `get_topic_reference` for the top 1–3 relevant topics (or `inspect_topic` if unknown).
3. **Compute**: prefer deterministic tools (`get_lap_table`, `compare_drivers`, `get_track_status_history`, etc.) over raw JSON reasoning.
4. **Answer**: concise engineer-style response with evidence (key values, lap ranges, timestamps), explicit uncertainty, and what data would resolve it.
5. **Cursor discipline**: if user specifies “as of lap/time,” call `set_time_cursor` before analysis.

## Major Refactors (Allowed)
This work is greenfield-friendly and may introduce:
- New `TopicRegistry` module and replacing hard-coded topic arrays in the downloader.
- Best-effort download + manifest output.
- New DataBook module + new tools + prompt updates.

## Testing Strategy
Add deterministic unit tests (offline):

- Downloader:
  - Missing/404 topic does not fail whole download.
  - Manifest includes attempted topics and per-topic status.
- DataBook tools:
  - `get_data_book_index` returns expected topics.
  - `get_topic_reference` returns bounded examples and `present` flags.
- Prompt snapshot test updated to include DataBook workflow and new tools.

## Open Questions / Risks
- Topic completeness: static per-session `{topic}.jsonStream` endpoints might have additional topics not currently known. The Topic Registry should allow easy extension, and the manifest provides evidence of attempted coverage.
- Semantics can drift: the DataBook should be versioned and iterated based on real sessions and user questions. The “example” path provides rapid feedback without bloating prompts.

