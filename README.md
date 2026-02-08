# F1aire

Terminal F1 AI race engineer chat agent.

Pick a season/Grand Prix/session, download the official live timing feeds, then chat with an “engineer” that answers using the loaded session data (pace deltas, stints/tyres, gaps, safety car phases, undercut windows, etc.). The agent can also run sandboxed Python (Pyodide) for custom calculations.

## Quickstart (recommended)

Run the latest published version (no clone required):

```bash
npx -y f1aire@latest
```

Requires Node `>= 24.13.0`.
Set `OPENAI_API_KEY` (see Configuration) or paste it in-app when prompted.

## Development (from source)

1) Install Node via mise (see `mise.toml`):

   ```bash
   mise install
   ```

2) Install dependencies:

   ```bash
   npm install
   ```

## Running

- Dev TUI (Ink):

  ```bash
  mise run dev
  ```

- Unit tests (Vitest):

  ```bash
  mise run test
  ```

## Configuration

OpenAI:

```bash
export OPENAI_API_KEY=...
# optional (defaults to gpt-5.2-codex)
export OPENAI_API_MODEL=...
```

You can also paste/store the API key in-app (Settings on the season/meeting/session screens, or when prompted after a download).

## Usage

- Navigation: Enter selects, `b`/Backspace/Esc goes back, `q` quits.
- Engineer chat: Enter sends, PgUp/PgDn scroll, Esc back, Ctrl+C quits.

## AI Race Engineer

After a session download finishes, the UI switches into chat mode. The first assistant message includes a quick summary, then you can ask questions like:

- “Compare Norris vs Verstappen on clean laps 10–25.”
- “What was the undercut window vs car #1? Assume 20.5s pit loss.”
- “As of lap 35, who’s gaining the most on average?”

## E2E tests (optional)

Runs a live streaming call against the OpenAI API (networked; costs money):

```bash
npm run test:e2e
```

## Data directory

Session downloads are stored under the per-user data directory for the app name `f1aire`:

- macOS/Linux:
  - `$XDG_DATA_HOME/f1aire/data` (when `XDG_DATA_HOME` is set)
  - `~/.local/share/f1aire/data` (fallback)
- Windows:
  - `%LOCALAPPDATA%\f1aire\data` (preferred)
  - `%APPDATA%\f1aire\data` (fallback)
  - `%USERPROFILE%\AppData\Local\f1aire\data` (final fallback)

## Usage notes

- Downloads fetch data from `livetiming.formula1.com` and write `live.jsonl` and `subscribe.json` under the data directory.
- If a session folder already exists, it will be reused; delete the folder to re-download cleanly (partial folders are rejected).
- First run downloads the Pyodide runtime (~200MB) into the data directory; later runs reuse the cached assets.
