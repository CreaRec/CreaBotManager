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
# Fill in TELEGRAM_BOT_TOKEN and ALLOWED_TELEGRAM_IDS

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

Changes are saved to `config/managed-bots.json` immediately — no bot restart required.

You can also edit `config/managed-bots.json` manually (see `config/managed-bots.example.json`).

### 2. Server permissions

The manager process must be allowed to run `systemctl` and `journalctl` for those units. See `deploy/sudoers-crea-bot-manager.example` — install via `visudo` on the server.

Set `USE_SUDO_FOR_SYSTEMCTL=true` in `.env` (default).

### 3. Telegram commands

| Command | Action |
|---------|--------|
| `/botadd <id> <service> [name]` | Register a bot (saved to JSON) |
| `/botremove <id>` | Remove bot from registry |
| `/bots` | List registered bots and live status |
| `/botstart <id>` | `systemctl start` |
| `/botstop <id>` | `systemctl stop` |
| `/botrestart <id>` | `systemctl restart` |
| `/botstatus <id>` | `systemctl status` |
| `/botlogs <id> [lines]` | `journalctl` tail (max 200 lines) |

Only user IDs from `ALLOWED_TELEGRAM_IDS` can run commands. Service names are taken from the registry only — arbitrary shell input is never executed.

## Project layout

```
src/
  index.ts       # Entry point, graceful shutdown
  config.ts      # Zod-validated environment
  bot/bot.ts     # Telegraf handlers
  services/      # Bot registry, systemd control
config/
  managed-bots.json          # Your registered bots (deployed with the app)
  managed-bots.example.json  # Example registry
scripts/
  start-local.sh # Local dev bootstrap
  deploy.sh      # Local → remote deploy (runs tests first)
  deploy-remote.sh
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

Override defaults via environment variables: `SERVER_HOST`, `SSH_USER`, `REMOTE_APP_DIR`, `SERVICE_NAME`, `DEPLOY_PASSWORD`.

## Extending the template

- Add handlers in `src/bot/bot.ts`
- Add business logic under `src/services/` (import module files directly, no barrel index)
- Add tests as `src/**/*.test.ts` next to the code they validate
- Update `.env.example` when adding new config keys
