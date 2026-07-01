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

### 4. Telegram interface

**Button menus (recommended):**

- `/start` or `/menu` — главное меню
- «Боты» → выберите бота → Запуск / Стоп / Перезапуск / Статус / Логи
- «Пользователи» (админ) → выберите оператора → выдать / забрать доступ / удалить
- Текст «список ботов» или «пользователи» — то же меню

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
  telegram-bot-manager.service  # systemd unit template
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

## Extending the template

- Add handlers in `src/bot/bot.ts`
- Add business logic under `src/services/` (import module files directly, no barrel index)
- Add tests as `src/**/*.test.ts` next to the code they validate
- Update `.env.example` when adding new config keys
