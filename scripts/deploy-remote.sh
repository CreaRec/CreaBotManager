#!/usr/bin/env bash
# Remote deploy steps (run on the server via scripts/deploy.sh).
# Expects: REMOTE_APP_DIR, SERVICE_NAME, DEPLOY_USER.

set -euo pipefail

: "${REMOTE_APP_DIR:?REMOTE_APP_DIR is required}"
: "${SERVICE_NAME:?SERVICE_NAME is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"

cd "$REMOTE_APP_DIR"

# shellcheck source=scripts/setup-runtime-data.sh
. scripts/setup-runtime-data.sh
setup_runtime_data

start_sudo_keepalive() {
  while true; do
    sudo -n true || exit
    sleep 50
    kill -0 "$$" || exit
  done 2>/dev/null &
  SUDO_KEEPALIVE_PID=$!
  trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null' EXIT
}

if ! sudo -n true 2>/dev/null; then
  if [ -n "${DEPLOY_PASSWORD:-}" ]; then
    echo "[remote] acquiring sudo for systemd setup..."
    if ! printf '%s\n' "$DEPLOY_PASSWORD" | sudo -S -v; then
      echo "[remote] sudo authentication failed (check DEPLOY_PASSWORD secret)." >&2
      exit 1
    fi
  else
    echo "[remote] sudo required for systemd setup (enter password once)..."
    sudo -v
  fi
  start_sudo_keepalive
fi

echo "[remote] installing dependencies..."
npm ci || npm install

echo "[remote] building (tsc)..."
npm run build

echo "[remote] installing systemd unit ${SERVICE_NAME}..."
TMP_UNIT="$(mktemp)"
sed -e "s#__USER__#${DEPLOY_USER}#g" \
    -e "s#__APP_DIR__#${REMOTE_APP_DIR}#g" \
    deploy/telegram-bot-manager.service > "$TMP_UNIT"
sudo cp "$TMP_UNIT" "/etc/systemd/system/${SERVICE_NAME}.service"
rm -f "$TMP_UNIT"

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

echo "[remote] configuring TimeoutStopSec for manager and registered bots..."
TIMEOUT_STOP_SEC="${TIMEOUT_STOP_SEC:-10}" \
REMOTE_APP_DIR="$REMOTE_APP_DIR" \
MANAGED_BOTS_CONFIG="$REMOTE_APP_DIR/data/managed-bots.json" \
SERVICE_NAME="$SERVICE_NAME" \
bash scripts/configure-managed-bot-timeouts.sh

echo "[remote] service status:"
sudo systemctl --no-pager --full status "${SERVICE_NAME}" || true
echo "[remote] recent logs:"
sudo journalctl -u "${SERVICE_NAME}" -n 30 --no-pager || true
