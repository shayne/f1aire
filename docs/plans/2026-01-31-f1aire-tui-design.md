# F1aire TUI Design

Date: 2026-01-31

## Summary
Build a TypeScript-based Ink TUI to download Formula 1 live timing data for a selected season/meeting/session, store it in an XDG-compliant data directory, and show a lightweight race summary (winner, fastest lap, lap count). This is the foundation for future “race engineer” features.

## Goals
- Interactive TUI flow: Season -> Meeting -> Session -> Download -> Summary.
- Use the same live timing data source and conventions as undercut-f1.
- Persist data in XDG data directory with stable, readable subfolder names.
- Provide a minimal, correct summary after download.
- Establish modern TypeScript, linting, and formatting defaults via mise tasks.

## Non-Goals (for v1)
- Live session streaming or real-time processing.
- Advanced race engineer analysis or telemetry overlays.
- Multi-session batch downloads.

## Data Source and Storage
### Source
Use the same endpoints and topics as undercut-f1:
- Index: `https://livetiming.formula1.com/static/{year}/Index.json`
- Session streams: `https://livetiming.formula1.com/static/{session.Path}{Topic}.jsonStream`

Topic sets:
- Race: `Heartbeat`, `CarData.z`, `Position.z`, `ExtrapolatedClock`, `TopThree`, `TimingStats`, `TimingAppData`, `WeatherData`, `TrackStatus`, `DriverList`, `RaceControlMessages`, `SessionData`, `LapCount`, `TimingData`, `ChampionshipPrediction`, `TeamRadio`, `PitLaneTimeCollection`, `PitStopSeries`, `PitStop`
- Non-race: same list without `LapCount` and `ChampionshipPrediction`

### Output Layout
Default data root:
- macOS/Linux: `$XDG_DATA_HOME/f1aire/data` (fallback `~/.local/share/f1aire/data`)
- Windows: `%LOCALAPPDATA%\f1aire\data`

Per-session directory naming:
`<year>_<location>_<session name>` with spaces replaced by `_`.

Files:
- `live.jsonl`: merged, time-ordered stream of all topic updates
- `subscribe.json`: initial `SessionInfo` and `Heartbeat` JSON snapshots

Write behavior:
- If either file exists, abort and show a friendly error.
- Always create the target directory before writing.

## Application Architecture
```
src/
  app.tsx           # screen router
  index.ts          # Ink render entrypoint
  core/
    f1-api.ts        # fetch meetings and session streams
    download.ts      # topic download and merge
    parse.ts         # parsing helpers (time parsing, JSONL streaming)
    summary.ts       # derive winner/fastest lap/lap count
    xdg.ts           # data directory resolution
    types.ts         # shared types (Meeting, Session, RawTimingDataPoint)
  tui/
    screens/
      SeasonPicker.tsx
      MeetingPicker.tsx
      SessionPicker.tsx
      Downloading.tsx
      Summary.tsx
    components/
      Header.tsx
      FooterHints.tsx
      SelectList.tsx
```

The `core/` layer is UI-agnostic and testable. The `tui/` layer handles layout, navigation, and rendering only.

## TUI Flow and UX
- Consistent layout: header (app name + breadcrumb), main content (list or status), footer (key hints).
- Lists use `ink-select-input` for arrow/j/k navigation and enter to select.
- Global keys with `useInput`: `q` to quit, `esc`/`backspace` to go back.
- Error states are dedicated screens with a clear message and a back action.

Screens:
1. **SeasonPicker**: list recent seasons and current year.
2. **MeetingPicker**: list meetings for the selected year.
3. **SessionPicker**: list sessions for a meeting (Race, Sprint, Qualifying, Practice).
4. **Downloading**: show progress and current topic.
5. **Summary**: winner, fastest lap, lap count, and data path.

## Summary Derivation
Parse `live.jsonl` sequentially and maintain minimal “latest state”:
- `DriverList` for driver names/teams.
- `TimingData` for positions and best laps.
- `LapCount` for total laps.

Derive:
- Winner = driver with final `Position === "1"` (fallback to lowest numeric position).
- Fastest lap = minimum parsed `BestLapTime.Value` across drivers.
- Total laps = `LapCount.TotalLaps` (fallback to winner’s `NumberOfLaps`).

Lap time parsing supports `M:SS.mmm` and `SS.mmm`.

## Error Handling
- Missing `session.Path` -> “Session not complete yet.”
- Network errors -> “Failed to download topic X” with retry/back.
- File collisions -> “Data already exists; delete files to re-download.”
- Partial summary -> show best-effort results with warning.

## Tooling and Tasks (via mise)
- Node: 24.13.0 LTS
- Package manager: npm
- TypeScript: ESM (`type: module`, `module: nodenext`)
- Lint: ESLint flat config + typescript-eslint recommended
- Format: Prettier + eslint-config-prettier
- Test: Vitest for core parsing and path utilities

Mise tasks:
- `dev`: run the TUI
- `build`: ts compile
- `typecheck`: tsc --noEmit
- `lint`: eslint
- `format`: prettier
- `test`: vitest

## Open Questions
- Confirm final list of seasons to display (e.g., last 10 years vs all available).
- Whether to show a download size estimate before confirming.
