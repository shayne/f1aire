# Repository Guidelines

## Project Structure

- `src/`: TypeScript source (ESM).
- `src/app.tsx`: top-level Ink app and screen routing.
- `src/tui/`: TUI screens/components (`screens/`, `components/`, `layout.ts`, `theme.ts`).
- `src/core/`: F1 live timing integration (fetching `Index.json`, downloading `*.jsonStream`, parsing/merging, summaries, XDG config/data paths).
- `src/agent/`: “race engineer” AI session (OpenAI model wiring, tools, Pyodide bridge).
- `src/**/*.test.ts(x)`: colocated Vitest tests.
- `src/types/*.d.ts`: local type shims for untyped deps.
- `dist/`: build output (generated; do not edit).
- `docs/`: design notes and implementation plans.

## Build, Test, and Development Commands

- `mise install`: install the pinned Node version from `mise.toml`.
- `npm install`: install dependencies.
- `mise run dev` (or `npm run dev`): run the TUI in dev (`tsx src/index.tsx`).
- `npm run build`: compile to `dist/` (`tsc -p tsconfig.build.json`).
- `npm run typecheck`: typecheck without emitting.
- `npm test`: run unit tests (Vitest).
- `npm run test:e2e`: runs OpenAI streaming e2e (requires `OPENAI_API_KEY`; makes network calls).

## Coding Style & Naming Conventions

- Format with Prettier (`npm run format`): semicolons, single quotes, trailing commas.
- Lint with ESLint (`npm run lint`): `@eslint/js` + `typescript-eslint` + `eslint-config-prettier`.
- Naming: React components use `PascalCase.tsx` (e.g. `EngineerChat.tsx`); utilities/modules typically use `kebab-case.ts`.

## Testing Guidelines

- Framework: Vitest; tests are named `*.test.ts` / `*.test.tsx` and live next to code.
- Prefer deterministic tests: mock network (`fetch`) and time; keep unit tests offline.
- For TUI behavior, use `ink-testing-library` (see `src/tui/**.test.tsx`).

## Commit & Pull Request Guidelines

- Commit messages generally follow Conventional Commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `ux:` (imperative subject).
  - Example: `fix: merge incremental TimingData patches in summary`.
- PRs should include: what/why, how to reproduce, and how you tested (e.g. `npm test`).
- For UI/TUI changes, include a screenshot or a captured frame from tests when relevant.

## Configuration & Data Notes

- Downloaded session data is stored outside the repo (XDG data dir, e.g. `~/.local/share/f1aire/data`); don’t commit it.
- Secrets: use `OPENAI_API_KEY` (env or app settings); never commit keys (`.env` is gitignored).

