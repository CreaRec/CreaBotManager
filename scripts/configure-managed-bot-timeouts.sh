#!/usr/bin/env bash
# Install systemd drop-ins (TimeoutStopSec) for the manager and registered bots.
# Safe to re-run; does not overwrite full unit files.
#
# Usage on server:
#   cd ~/crea-bot-manager
#   sudo ./scripts/configure-managed-bot-timeouts.sh
#
# Env:
#   TIMEOUT_STOP_SEC=10          (default)
#   REMOTE_APP_DIR               (default: repo root)
#   MANAGED_BOTS_CONFIG          (default: $REMOTE_APP_DIR/data/managed-bots.json)
#   SERVICE_NAME                 (default: telegram-bot-manager)

set -euo pipefail

TIMEOUT_STOP_SEC="${TIMEOUT_STOP_SEC:-10}"
APP_DIR="${REMOTE_APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
MANAGED_BOTS_CONFIG="${MANAGED_BOTS_CONFIG:-${APP_DIR}/data/managed-bots.json}"
SERVICE_NAME="${SERVICE_NAME:-telegram-bot-manager}"
DROPIN_NAME="crea-timeout.conf"
TEMPLATE="${APP_DIR}/deploy/systemd-timeout-stop.conf"

if [ ! -f "$TEMPLATE" ]; then
  echo "[systemd] missing template: $TEMPLATE" >&2
  exit 1
fi

if ! command -v node >/dev/null; then
  echo "[systemd] node is required" >&2
  exit 1
fi

collect_service_units() {
  local collector="${APP_DIR}/dist/services/managed-service-units.js"
  if [ ! -f "$collector" ]; then
    echo "[systemd] run npm run build first (missing $collector)" >&2
    exit 1
  fi

  node -e "
    const { collectManagedServiceUnits } = require(process.argv[1]);
    const units = collectManagedServiceUnits(process.argv[2], process.argv[3]);
    process.stdout.write(units.join('\n'));
  " "$collector" "$MANAGED_BOTS_CONFIG" "$SERVICE_NAME"
}

install_timeout_dropin() {
  local unit="$1"
  local staging dropin_dir
  # Stage drop-in locally, then sudo cp -r into /etc/systemd/system/ (no sudo mkdir/tee).
  staging="$(mktemp -d)"
  dropin_dir="${staging}/${unit}.service.d"
  mkdir -p "$dropin_dir"
  sed "s/^TimeoutStopSec=.*/TimeoutStopSec=${TIMEOUT_STOP_SEC}/" "$TEMPLATE" > "${dropin_dir}/${DROPIN_NAME}"
  sudo cp -r "${dropin_dir}" "/etc/systemd/system/"
  rm -rf "$staging"
  echo "[systemd] ${unit}: installed /etc/systemd/system/${unit}.service.d/${DROPIN_NAME} (TimeoutStopSec=${TIMEOUT_STOP_SEC})"
}

main() {
  local units_raw units=() unit
  units_raw="$(collect_service_units)"
  if [ -z "$units_raw" ]; then
    echo "[systemd] no units to configure" >&2
    exit 1
  fi

  while IFS= read -r unit; do
    [ -n "$unit" ] && units+=("$unit")
  done <<< "$units_raw"

  for unit in "${units[@]}"; do
    install_timeout_dropin "$unit"
  done

  sudo systemctl daemon-reload
  echo "[systemd] daemon-reload complete for ${#units[@]} unit(s)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
