# Post-Session AI Chat Analytics Design

Date: 2026-02-02

## Goal
Deliver a post-session, single-event AI chat that answers analytical questions with deterministic, evidence-backed outputs. Priorities: pace/degradation, strategy/pit windows, head-to-head comparison, and position/track-position evolution.

## Non-Goals (for this phase)
- Cross-session or cross-season comparisons.
- Live-session guidance (this is post-session only).
- Full telemetry visualization or track-map graphics.
- Persistent chat history on disk.
- F1 TV auth integration (unless required for data availability in a later phase).

## Current State
- Session downloads parse `subscribe.json` and `live.jsonl` into a `SessionStore` and processors.
- Tools expose raw topic access, lap tables, clean-lap comparisons, and a `run_js` escape hatch.
- Chat UI is a Gemini-style TUI with streaming responses.

## Proposed Architecture

### Core Additions
- **AnalysisIndex**: a deterministic, precomputed index derived from `SessionStore` + processors.
- **TimeCursor**: a standardized “as-of” resolver (lap or timestamp) that all tools can consume.
- **Tool-first analysis**: a small set of deterministic tools wraps the index for consistent answers.

### Data Flow
```
Download -> Parse -> SessionStore + Processors
                       |
                       v
                 AnalysisIndex
                       |
                       v
         Tool Layer + AI Chat UI
```

### AnalysisIndex Outputs
- Per-driver lap timeline:
  - lap, timestamp, lap time, gap/interval, position (or inferred), stint, pit flags, track status.
- Per-lap snapshots:
  - lap -> { driver -> lap record }
- Event streams:
  - pit in/out, stint changes, track-status changes, position changes.
- Derived summaries:
  - clean-lap lists, stint pace slopes, median pace per stint, compound deltas.

## TimeCursor
All tools accept `asOf`:
- `asOf: { lap?: number; iso?: string; latest?: boolean }`
- Resolver maps to nearest lap snapshot and timestamp.
- Default is `latest`.

This enables time-travel answers and aligns with undercut-f1’s timing-by-lap exploration.

## Tooling (V1)

### Pace & Degradation
- `get_stint_pace(driver, stintId|lapRange, cleanOnly, requireGreen)`
  - slope, median pace, variance, tyre age mapping, cited lap range.
- `get_pace_timeline(driver, lapRange, cleanOnly)`
  - per-lap pace + traffic/flag labels.
- `get_compound_delta(compoundA, compoundB, ageWindow, cleanOnly)`
  - normalized deltas by tyre compound + age window.

### Strategy
- `get_pit_events(driver?)`
  - pit in/out, estimated pit loss (pitlane + stationary when available).
- `get_undercut_window(a, b, lapRange, cleanOnly)`
  - net-gain window from pit timing + lap deltas.
- `simulate_rejoin(a, pitLap, competitors[])`
  - projected rejoin positions using lap deltas + pit loss.

### Head-to-Head
- `compare_drivers(a, b, lapRange, cleanOnly, requireGreen)`
  - summary stats, per-lap deltas, cited laps.

### Position / Track Position
- `get_position_changes(lapRange)`
  - overtakes and swaps with inferred causes (pit, pace, flag).
- `get_virtual_order(asOf)`
  - ranking + gaps at a given lap/time.

### Tool Output Contract
Each tool returns:
- `data`: structured payload for the model to use.
- `explain`: short evidence string (lap ranges, stints, flags).
- `availability`: `{ degraded: boolean; missing: string[]; fallback: string | null }`.

## Chat UX
- Persistent “As-of Lap/Time” indicator in the chat header.
- Model defaults to tools and cites lap ranges in responses.
- “Show me the laps” follow-up triggers a compact lap table output.

## Error Handling
- If core data is missing or gated, tools return `availability.degraded: true` with a fallback.
- The model should surface a one-line caveat and proceed with best-effort analysis.
- Tool failures show a terse failure line; user can retry.

## Testing
- Unit tests:
  - AnalysisIndex builders (stints, pit events, position changes, clean-lap filters).
- Tool contract tests:
  - Compare outputs against known sample sessions.
- Prompt/tool preference snapshots:
  - Ensure tools are used before `run_js`.
- Integration test:
  - Stubbed agent stream with canonical questions (pace delta, undercut window, position changes).

## Rollout
1) Build AnalysisIndex and TimeCursor resolver.
2) Implement V1 tool set with deterministic outputs.
3) Update prompt to prefer tools + evidence-first responses.
4) Add UX affordances (as-of indicator, “show me laps”).
5) Add tests and sample session fixtures.

## Open Questions
- How aggressively should we infer positions when Position topic is missing?
- What default thresholds define “traffic” vs “clean air”?
- Should the chat support exporting tables to CSV/JSON in V1?
