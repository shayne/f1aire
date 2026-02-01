# F1aire

Terminal UI for browsing Formula 1 meetings, downloading session data, and viewing quick summaries.

## Setup

1) Install Node via mise (see `mise.toml`):

   ```bash
   mise install
   ```

2) Install dependencies:

   ```bash
   npm install
   ```

## Running

- Dev TUI:

  ```bash
  mise run dev
  ```

- Tests:

  ```bash
  mise run test
  ```

## E2E tests (optional)

Run a live streaming call against the OpenAI API:

```bash
export OPENAI_API_KEY=...
export OPENAI_API_MODEL=gpt-5.2-codex
npm run test:e2e
```

## AI Race Engineer

Set your OpenAI key:

```bash
export OPENAI_API_KEY=...
```

After a session download finishes, the UI switches into chat mode.
The first assistant message includes a quick summary, then you can ask questions.

Chat controls:
- Enter: send
- Esc: back
- Ctrl+C: quit

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

- Navigation: Enter selects, `b`/Backspace/Esc goes back, `q` quits (chat mode uses Enter/Esc/Ctrl+C).
- Downloads fetch data from `livetiming.formula1.com` and write `live.jsonl` and `subscribe.json` under the data directory.
- If a session folder already exists, the download will fail; delete the folder to re-download.
