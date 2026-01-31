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

- Navigation: Enter selects, `b`/Backspace/Esc goes back, `q` quits.
- Downloads fetch data from `livetiming.formula1.com` and write `live.jsonl` and `subscribe.json` under the data directory.
- If a session folder already exists, the download will fail; delete the folder to re-download.
