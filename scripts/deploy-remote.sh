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

# Probe passwordless sudo with commands allowed by deploy sudoers.
sudo_probe() {
  sudo -n systemctl --version >/dev/null 2>&1 || \
    sudo -n cp --version >/dev/null 2>&1
}

is_interactive_deploy() {
  [ -t 0 ] && [ -t 1 ] && \
    [ "${CI:-}" != true ] && [ "${GITHUB_ACTIONS:-}" != true ]
}

start_sudo_keepalive() {
  while true; do
    sudo_probe || exit
    sleep 50
    kill -0 "$$" || exit
  done 2>/dev/null &
  SUDO_KEEPALIVE_PID=$!
  trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null' EXIT
}

if ! sudo_probe; then
  if [ -n "${DEPLOY_PASSWORD:-}" ]; then
    printf '%s\n' "$DEPLOY_PASSWORD" | sudo -S -v
    start_sudo_keepalive
  elif is_interactive_deploy; then
    echo "[remote] sudo required for systemd setup (enter password once)..."
    sudo -v
    start_sudo_keepalive
  else
    echo "[remote] ERROR: passwordless sudo is required for non-interactive deploy (CI)." >&2
    echo "[remote] Running as: $(whoami) (expected deploy user: ${DEPLOY_USER})" >&2
    echo "[remote] sudo -n systemctl --version:" >&2
    sudo -n systemctl --version 2>&1 >&2 || true
    echo "[remote] sudo -n cp --version:" >&2
    sudo -n cp --version 2>&1 >&2 || true
    echo "[remote] Fix: create /etc/sudoers.d/${DEPLOY_USER}-deploy with NOPASSWD for cp, mkdir, tee, systemctl, journalctl." >&2
    echo "[remote] The username in sudoers must match DEPLOY_USER exactly." >&2
    exit 1
  fi
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
