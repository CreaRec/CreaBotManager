#!/usr/bin/env bash
# Idempotent runtime data setup for server deploy.
# Creates data/, migrates legacy config/*.json, fixes permissions, updates .env paths.
#
# Expects REMOTE_APP_DIR (or runs in cwd) and DEPLOY_USER.

set -euo pipefail

setup_runtime_data() {
  local app_dir="${REMOTE_APP_DIR:-.}"
  local user="${DEPLOY_USER:-$(whoami)}"

  cd "$app_dir"

  echo "[runtime] preparing data/ for ${user}..."

  mkdir -p data
  chown "${user}:${user}" data 2>/dev/null || true
  chmod u+rwx data

  _migrate_json() {
    local filename="$1"
    local empty_content="$2"
    local target="data/${filename}"
    local legacy="config/${filename}"

    if [ -f "$target" ]; then
      echo "[runtime] keeping existing ${target}"
    elif [ -f "$legacy" ]; then
      cp "$legacy" "$target"
      echo "[runtime] migrated ${legacy} -> ${target}"
    else
      printf '%s\n' "$empty_content" >"$target"
      echo "[runtime] created ${target}"
    fi

    chown "${user}:${user}" "$target" 2>/dev/null || true
    chmod u+rw "$target" 2>/dev/null || true
  }

  _migrate_json "managed-bots.json" '{"bots":[]}'
  _migrate_json "user-permissions.json" '{"users":[]}'

  if [ -f ".env" ]; then
    _ensure_env_path "MANAGED_BOTS_CONFIG" "data/managed-bots.json"
    _ensure_env_path "USER_PERMISSIONS_CONFIG" "data/user-permissions.json"
  else
    echo "[runtime] .env not found — skip path updates (create .env before first start)"
  fi

  echo "[runtime] data/ ready (preserved across deploys, not synced from git)"
}

_ensure_env_path() {
  local key="$1"
  local value="$2"
  local env_file=".env"

  if ! grep -qE "^${key}=" "$env_file"; then
    echo "${key}=${value}" >>"$env_file"
    echo "[runtime] added ${key} to .env"
    return
  fi

  if grep -qE "^${key}=config/" "$env_file"; then
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^${key}=config/|${key}=data/|" "$env_file"
    else
      sed -i '' "s|^${key}=config/|${key}=data/|" "$env_file"
    fi
    echo "[runtime] updated ${key} in .env (config/ -> data/)"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  : "${REMOTE_APP_DIR:?REMOTE_APP_DIR is required}"
  : "${DEPLOY_USER:?DEPLOY_USER is required}"
  setup_runtime_data
fi
