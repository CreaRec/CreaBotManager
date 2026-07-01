# CreaBotManager

Telegram bot template for CreaRec bots. Based on the same patterns as Crea Trip Planner: TypeScript, Telegraf, Zod-validated config, Vitest, and bash/rsync deploy with systemd on the server.

```
Telegram  <->  Bot (Node + TypeScript + Telegraf)
```

## Requirements

- Node.js >= 20
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))

## Quick start (local)

```bash
cp .env.example .env
# Fill in TELEGRAM_BOT_TOKEN and ADMIN_TELEGRAM_IDS

chmod +x scripts/start-local.sh
./scripts/start-local.sh
```

Or manually:

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start bot with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled bot (`node dist/index.js`) |
| `npm test` | Run Vitest test suite |
| `npm run typecheck` | Type-check without emitting |

## Managed bots (systemd)

CreaBotManager controls other Telegram bots running as **systemd services** on Debian.

### 1. Register bots

**Via Telegram (recommended):**

```
/botadd trip-planner telegram-trip-planner Crea Trip Planner
/botremove trip-planner
```

- `id` — short name for commands (`/botstart trip-planner`), lowercase with hyphens
- `service` — exact systemd unit name (without `.service`)
- `name` — optional display name (defaults to `id`)

Changes are saved to `data/managed-bots.json` immediately — no bot restart required (this file is not overwritten by deploy).

You can also edit `data/managed-bots.json` manually (see `config/managed-bots.example.json` for the format).

### 2. User access (per-bot permissions)

In `.env` specify **only your** Telegram id as admin (one person):

```
ADMIN_TELEGRAM_IDS=123456789
```

Do **not** list operators here — add them via Telegram:

```
/useradd 987654321 Alice
/usergrant 987654321 trip-planner
```

| Role | How configured | Can do |
|------|----------------|--------|
| **Admin** | `ADMIN_TELEGRAM_IDS` in `.env` | Add/remove bots, manage users, control all bots |
| **Operator** | `/useradd` + `/usergrant` | Start/stop/restart **only assigned** bots |

Operators **cannot** run `/botadd` or `/botremove`.

### 3. Server permissions

The manager process must be allowed to run `systemctl` and `journalctl` for those units. See `deploy/sudoers-crea-bot-manager.example` — install via `visudo` on the server.

Set `USE_SUDO_FOR_SYSTEMCTL=true` in `.env` (default).

**Troubleshooting status and control:**

- `unknown` or ❓ — `systemctl is-active` returned an unexpected value (often missing sudo).
- Stop/restart fails but status shows `active` — reading status may work without sudo; **start/stop/restart** need the full sudoers file (all `start`, `stop`, `restart`, `is-active`, `status`, `journalctl` lines).
- On the server as user `crearec`:

```bash
sudo -n systemctl is-active telegram-trip-planner
sudo -n systemctl stop telegram-trip-planner
sudo -n systemctl start telegram-trip-planner
```

All three must work without a password prompt. Install rules from `deploy/sudoers-crea-bot-manager.example` (replace `USER` with `crearec`). The `show` rule is required for the human-readable **Статус** button.

**Slow stop/restart (~90 seconds):** default systemd `TimeoutStopSec` is 90s. Deploy runs `scripts/configure-managed-bot-timeouts.sh` to set `TimeoutStopSec=10` for the manager and every bot in `data/managed-bots.json`. On an existing server:

```bash
cd ~/crea-bot-manager
npm run build
sudo ./scripts/configure-managed-bot-timeouts.sh
```

Check: `systemctl show telegram-flibusta -p TimeoutStopUSec` → `10s`. Template for new bots: `deploy/telegram-managed-bot.service.example`.

### 4. Telegram interface

**Reply keyboard (always visible at the bottom):**

- `📋 Боты` — список ботов (inline-кнопки)
- `🏠 Меню` — главное inline-меню
- `📌 Мои боты` — назначенные вам боты
- `👥 Пользователи` — операторы (админ)
- `ℹ️ Помощь` — справка

**Inline menus** — выбор бота / действия / пользователя внутри сообщений.

**Text commands (for adding entries):**

| Command | Action |
|---------|--------|
| `/botadd <id> <service> [name]` | Register a bot |
| `/botremove <id>` | Remove bot from registry |

**Service control (admin or assigned operator):**

| Command | Action |
|---------|--------|
| `/bots` | List accessible bots and live status |
| `/botstart <id>` | `systemctl start` |
| `/botstop <id>` | `systemctl stop` |
| `/botrestart <id>` | `systemctl restart` |
| `/botstatus <id>` | `systemctl status` |
| `/botlogs <id> [lines]` | `journalctl` tail (max 200 lines) |

Admins have full access. Operators are limited to bots granted via `/usergrant`. Service names come from the registry only — arbitrary shell input is never executed.

## Project layout

```
src/
  index.ts       # Entry point, graceful shutdown
  config.ts      # Zod-validated environment
  bot/bot.ts     # Telegraf handlers
  services/      # Bot registry, systemd control
config/
  managed-bots.example.json
  user-permissions.example.json
data/                            # Runtime data (preserved across deploys)
  managed-bots.json
  user-permissions.json
scripts/
  start-local.sh         # Local dev bootstrap
  deploy.sh              # Local → remote deploy (runs tests first)
  deploy-remote.sh       # Server build + systemd (called by deploy.sh)
  setup-runtime-data.sh  # data/ dir, migration, permissions (called by deploy-remote)
deploy/
  telegram-bot-manager.service       # systemd unit template
  telegram-managed-bot.service.example
  systemd-timeout-stop.conf          # drop-in snippet (TimeoutStopSec=10)
  sudoers-crea-bot-manager.example
```

## Deploy (server)

Production runs the bot natively via **systemd** (no Docker required for the template).

1. Create `.env` on the server (copy from `.env.example`).
2. From your dev machine:

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh          # local network (192.168.1.135)
./scripts/deploy.sh --remote # via crearec.app
```

Deploy syncs files with `rsync`, runs `npm run build` on the server, and restarts the `telegram-bot-manager` systemd service.

**Runtime data is preserved across deploys:**

- `data/managed-bots.json` — registered bots (from `/botadd`)
- `data/user-permissions.json` — operators and access (from `/useradd`, `/usergrant`)

The `data/` directory is **not** overwritten by `rsync`. On each deploy, `scripts/setup-runtime-data.sh` runs automatically: creates `data/`, migrates legacy `config/*.json` if needed, sets file permissions, and updates `.env` paths to `data/` when missing.

Override defaults via environment variables: `SERVER_HOST`, `SSH_USER`, `REMOTE_APP_DIR`, `SERVICE_NAME`, `DEPLOY_PASSWORD`.

## GitHub Actions CI/CD

Merging into `main` triggers an automatic deploy to the production server via [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

**On every push and pull request:** the `test` job runs `npm ci` and `npm test`.

**On push to `main` only:** the `deploy` job runs after tests pass. GitHub Actions sets `CI=true` on the runner; `scripts/deploy.sh` forwards `CI`/`GITHUB_ACTIONS` to the remote script and skips forced TTY (`-tt`) when `DEPLOY_PASSWORD` is unset. The workflow then:

1. Writes the deploy SSH private key from GitHub Secrets
2. Opens an SSH ControlMaster socket authenticated with that key
3. Calls `./scripts/deploy.sh --remote`, which reuses the existing socket for rsync and remote build/restart

Required GitHub Secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `DEPLOY_SSH_KEY` | Private deploy key (matching the public key in server `authorized_keys`) |
| `DEPLOY_HOST` | Server hostname, for example `crearec.app` |
| `DEPLOY_USER` | SSH user, for example `crearec` |

**Server prerequisites for CI deploy** (one-time setup):

- Public deploy key in `~/.ssh/authorized_keys` for the deploy user
- Passwordless sudo for deploy commands. **The sudoers username must match `DEPLOY_USER` in GitHub Secrets exactly** (for example `crearec`).

  On the server, as a user with sudo access, run:

  ```sh
  DEPLOY_USER=crearec   # must match GitHub secret DEPLOY_USER
  command -v cp mkdir tee systemctl journalctl

  sudo tee "/etc/sudoers.d/${DEPLOY_USER}-deploy" > /dev/null <<EOF
  ${DEPLOY_USER} ALL=(ALL) NOPASSWD: /bin/cp, /usr/bin/cp, /bin/mkdir, /usr/bin/mkdir, /usr/bin/tee, /bin/systemctl, /usr/bin/systemctl, /usr/bin/journalctl
  EOF
  sudo chmod 440 "/etc/sudoers.d/${DEPLOY_USER}-deploy"
  sudo visudo -c -f "/etc/sudoers.d/${DEPLOY_USER}-deploy"
  ```

  Then **as the deploy user** (not root), verify no password is asked:

  ```sh
  sudo -n systemctl --version
  sudo -n cp --version
  sudo -n systemctl status telegram-bot-manager
  ```

- Node.js and `.env` already configured on the server

`DEPLOY_PASSWORD` is not used in CI. The workflow never overwrites `data/managed-bots.json`, `data/user-permissions.json`, or `.env` on the server.

## Extending the template

- Add handlers in `src/bot/bot.ts`
- Add business logic under `src/services/` (import module files directly, no barrel index)
- Add tests as `src/**/*.test.ts` next to the code they validate
- Update `.env.example` when adding new config keys
