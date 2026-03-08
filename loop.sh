#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

cd "$REPO_ROOT"

if [[ -x "$REPO_ROOT/node_modules/.bin/tsx" ]]; then
  exec "$REPO_ROOT/node_modules/.bin/tsx" "$REPO_ROOT/scripts/codex-loop.ts" "$@"
fi

exec npx --no-install tsx "$REPO_ROOT/scripts/codex-loop.ts" "$@"
