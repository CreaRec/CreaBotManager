# Docker + GHCR deployment

The manager runs as a Docker container pulled from GitHub Container Registry (GHCR). Releases happen only through GitHub Actions when changes land on `main`. There is no local deploy script.

Image: `ghcr.io/crearec/crea-bot-manager`

The manager mounts the host Docker socket so it can start/stop/restart other Compose bots by project and service labels.

## How a release works

1. Merge or push to `main`.
2. Actions runs tests and builds the image.
3. Actions pushes tags `main` and `sha-<short>` to GHCR.
4. Actions copies `docker-compose.yml` to the server, exports `IMAGE_TAG`, then runs `docker compose pull && up -d`.

Secrets and registry data stay on the server in `.env` and `data/`.

## One-time server bootstrap

Use the same Linux user that already runs Docker/Portainer (`crearec`).

### 1. GitHub / GHCR

After the first successful `publish` job:

1. Open the `crea-bot-manager` package under your GitHub user/org.
2. Link it to the repository if needed.
3. Keep the package **Private**.
4. Create a PAT with `read:packages` for the server to pull the image (if not already logged in for other bots).

### 2. Docker login on the server

```sh
echo "$GHCR_TOKEN" | docker login ghcr.io -u CreaRec --password-stdin
docker compose version
```

### 3. Deploy directory

Default path: `/home/crearec/crea-bot-manager`

```sh
mkdir -p /home/crearec/crea-bot-manager/data
cd /home/crearec/crea-bot-manager
```

Copy `docker-compose.yml` from the repo once (Actions will refresh it on later deploys).

Create `.env` from [`.env.example`](../.env.example).

`DOCKER_GID` must be a **numeric** GID. Compose does not expand shell commands in `.env`.

```sh
# print the number, then paste it into .env
stat -c '%g' /var/run/docker.sock
```

Example `.env`:

```sh
TELEGRAM_BOT_TOKEN=...
ADMIN_TELEGRAM_IDS=...
IMAGE=ghcr.io/crearec/crea-bot-manager
IMAGE_TAG=main
DOCKER_GID=998
```

Wrong (will fail with “Unable to find group $(stat …)”):

```sh
DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
```

On macOS bootstrap hosts use `stat -f '%g' /var/run/docker.sock` instead.

Move existing runtime JSON into `data/` if you already had them from the systemd install:

```sh
# example migration from the old checkout
cp /home/crearec/crea-bot-manager/data/managed-bots.json ./data/   # if already there
cp /home/crearec/crea-bot-manager/data/user-permissions.json ./data/
```

Ensure `data/` is writable by the container user (`node`, UID 1000).

### 4. Migrate managed-bots.json schema

Replace systemd `serviceName` with Compose project/service:

```json
{
  "bots": [
    {
      "id": "trip-planner",
      "name": "Crea Trip Planner",
      "composeProject": "crea-trip-planner",
      "composeService": "bot"
    },
    {
      "id": "video-downloader",
      "name": "Crea Video Downloader",
      "composeProject": "crea-video-downloader-bot",
      "composeService": "bot"
    },
    {
      "id": "flibusta",
      "name": "FlibustaBot",
      "composeProject": "crea-flibusta-bot",
      "composeService": "bot"
    }
  ]
}
```

`composeProject` is the Compose project name (usually the deploy directory basename). `composeService` defaults to `bot`.

### 5. Stop the old systemd unit

```sh
sudo systemctl disable --now telegram-bot-manager
```

Later deploys also attempt this if the unit still exists.

### 6. First start

```sh
cd /home/crearec/crea-bot-manager
docker compose pull
docker compose up -d
```

Or merge to `main` and let Actions deploy.

Check:

```sh
docker compose ps
docker compose logs -f bot
docker ps --filter label=com.docker.compose.project=crea-trip-planner
```

Then send `/start` in Telegram and verify `/bots` shows status for registered Compose bots.

After the container is stable, you can remove any old full source checkout (`node_modules`, `dist`, etc.) and keep only this thin deploy directory. Sudoers rules for `systemctl`/`journalctl` are no longer required for the manager.

## Day-to-day operations

Deploy: merge to `main`.

On the server (or via Portainer):

```sh
cd /home/crearec/crea-bot-manager
docker compose ps
docker compose logs -f bot
docker compose restart bot
```

After editing `.env`, restart so env reloads:

```sh
docker compose restart bot
```

## GitHub Actions secrets

| Secret | Purpose |
|--------|---------|
| `DEPLOY_SSH_KEY` | Private key for SSH deploy |
| `DEPLOY_HOST` | Tailscale IP or MagicDNS hostname of the server (for example `100.118.169.52`) |
| `DEPLOY_USER` | SSH user (for example `crearec`) |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID (Trust credentials) for ephemeral CI nodes |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret (Trust credentials) |

Deploy joins the tailnet with `tag:ci` via [`tailscale/github-action`](https://github.com/tailscale/github-action), then SSHs to `DEPLOY_HOST`. Create the OAuth client under Tailscale **Settings → Trust credentials** (not legacy OAuth clients).

GHCR push uses the workflow `GITHUB_TOKEN` (`packages: write`). No extra registry secret is required for publish.

The deploy user needs Docker Compose without sudo, and passwordless sudo for `systemctl` only while the systemd unit is being retired.
