#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${VERSION:-}" ]]; then
  echo "VERSION is required." >&2
  exit 1
fi

if [[ -x "$ROOT_DIR/node_modules/.bin/tsx" ]]; then
  exec "$ROOT_DIR/node_modules/.bin/tsx" "$ROOT_DIR/scripts/build-npm-package.ts"
fi

exec npx --no-install tsx "$ROOT_DIR/scripts/build-npm-package.ts"
