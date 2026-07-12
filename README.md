# CreaBotManager

Telegram bot that manages other CreaRec bots running as Docker Compose stacks. TypeScript, Telegraf, Zod-validated config, Vitest, GHCR image + Compose deploy.

```
Telegram  <->  Manager (Node in Docker)  <->  Docker socket  <->  managed bots
```

## Requirements

- Node.js >= 20 (local development)
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Docker + Compose on the production host (same as the managed bots)

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

Local mode talks to Docker on the host (`DOCKER_PATH` / `DOCKER_HOST`). For production, see [docs/docker.md](docs/docker.md).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start bot with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled bot (`node dist/index.js`) |
| `npm test` | Run Vitest test suite |
| `npm run typecheck` | Type-check without emitting |

## Managed bots (Docker Compose)

CreaBotManager controls other Telegram bots by **Compose project + service** labels on the host Docker daemon.

### 1. Register bots

**Via Telegram (recommended):**

```
/botadd trip-planner crea-trip-planner Crea Trip Planner
/botremove trip-planner
```

- `id` — short name for commands (`/botstart trip-planner`), lowercase with hyphens
- `composeProject` — Compose project name (usually the deploy directory basename)
- `name` — optional display name (defaults to `id`)
- `composeService` defaults to `bot`

Examples matching current production stacks:

```
/botadd trip-planner crea-trip-planner Crea Trip Planner
/botadd video-downloader crea-video-downloader-bot Crea Video Downloader
/botadd flibusta crea-flibusta-bot FlibustaBot
```

Changes are saved to `data/managed-bots.json` immediately — no manager restart required (this file is not overwritten by deploy).

You can also edit `data/managed-bots.json` manually (see `config/managed-bots.example.json`).

### 2. User access (per-bot permissions)

In `.env` specify **only your** Telegram id as admin:

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

### 3. Docker access

The manager container mounts `/var/run/docker.sock` and joins the host `docker` group via `DOCKER_GID` in `.env`. Put a **number**, not a shell command:

```sh
stat -c '%g' /var/run/docker.sock   # print GID, e.g. 998
# then in .env:
DOCKER_GID=998
```

**Troubleshooting:**

- `unknown` / ❓ — container missing or Docker socket inaccessible
- Permission errors — check `DOCKER_GID` and that the socket is mounted
- «Контейнер не найден» — wrong `composeProject` / `composeService`, or the stack is not running

On the server:

```bash
docker ps --filter label=com.docker.compose.project=crea-trip-planner
docker compose -p crea-trip-planner ps
```

### 4. Telegram interface

**Reply keyboard:** `📋 Боты`, `🏠 Меню`, `📌 Мои боты`, `👥 Пользователи` (admin), `ℹ️ Помощь`

**Registry (admin):**

| Command | Action |
|---------|--------|
| `/botadd <id> <composeProject> [name]` | Register a bot |
| `/botremove <id>` | Remove bot from registry |

**Lifecycle (admin or assigned operator):**

| Command | Action |
|---------|--------|
| `/bots` | List accessible bots and live status |
| `/botstart <id>` | `docker start` |
| `/botstop <id>` | `docker stop` |
| `/botrestart <id>` | `docker restart` |
| `/botstatus <id>` | Container inspect status |
| `/botlogs <id> [lines]` | `docker logs` tail (max 200 lines) |

Targets come from the registry only — arbitrary shell input is never executed.

## Project layout

```
src/
  index.ts       # Entry point, graceful shutdown
  config.ts      # Zod-validated environment
  bot/           # Telegraf handlers and menus
  services/      # Registry, Docker control, access
config/
  managed-bots.example.json
  user-permissions.example.json
data/            # Runtime data (preserved across deploys)
Dockerfile
docker-compose.yml
docs/docker.md
scripts/
  start-local.sh
```

## Deploy (production)

Production is **GHCR + Docker Compose** only. There is no local deploy script.

See [docs/docker.md](docs/docker.md) for bootstrap, migration from systemd, and ops.

Deploy directory: `/home/crearec/crea-bot-manager`  
Image: `ghcr.io/crearec/crea-bot-manager`

**Runtime data preserved across deploys:**

- `data/managed-bots.json`
- `data/user-permissions.json`
- `.env` (never overwritten by Actions)

## GitHub Actions CI/CD

Merging into `main` runs test → publish image to GHCR → SSH deploy (`docker compose pull && up -d`).

Required GitHub Secrets:

| Secret | Purpose |
|--------|---------|
| `DEPLOY_SSH_KEY` | Private deploy key |
| `DEPLOY_HOST` | Server hostname |
| `DEPLOY_USER` | SSH user (for example `crearec`) |

GHCR push uses the workflow `GITHUB_TOKEN` (`packages: write`). The server needs a one-time `docker login ghcr.io` with a `read:packages` PAT.

## Extending

- Add handlers in `src/bot/bot.ts`
- Add business logic under `src/services/`
- Add tests as `src/**/*.test.ts`
- Update `.env.example` when adding new config keys
