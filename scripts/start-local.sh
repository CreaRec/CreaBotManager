#!/usr/bin/env bash
# Local development: install dependencies and start the bot with reload.

set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=scripts/lib.sh
. scripts/lib.sh

if [ ! -f ".env" ]; then
  err "No .env found. Copy .env.example to .env and fill it in first."
  exit 1
fi

log "Installing dependencies (npm install)..."
npm install

ok "Starting bot in watch mode. Press Ctrl-C to stop."
npm run dev
