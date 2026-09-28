# Self-hosting OpenRive

Run OpenRive on a server, NAS or your own Docker Desktop so a team can share it. Three options:

| Option | Database | Best for |
| --- | --- | --- |
| [Docker Compose + PostgreSQL](#option-a-docker-compose--postgresql-recommended) | PostgreSQL service | Teams and servers (recommended) |
| [Docker, single container](#option-b-single-container-embedded-database) | Embedded (PGlite) in a volume | Personal use, NAS, quick trials |
| [Bun without Docker](#option-c-bun-without-docker) | Either | Servers where you manage the runtime yourself |

## Before you start: protecting access

A self-hosted server (one with a `DATABASE_URL`) **asks for a sign-in**: an email and a password, with nothing sent
by mail to confirm. The first person to sign up becomes the administrator; `OPENRIVE_SIGNUP` decides whether anyone
else may. See [Accounts and sign-in](authentication.md).

For a second, coarser gate — or to keep the instance completely private — **set an access token**, which puts HTTP
Basic auth in front of everything:

```env
OPENRIVE_ACCESS_TOKEN=a-long-random-password
```

Every request then requires HTTP Basic auth with that password (any user name). Browsers show a sign-in prompt once.
Serve it over HTTPS (see [reverse proxy](#https-with-a-reverse-proxy)) so the password is not sent in plain text.

---

## Option A: Docker Compose + PostgreSQL (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS/Linux) or Docker Engine
with the Compose plugin.

```bash
git clone https://github.com/UpstandPlatform/OpenRive.git
cd OpenRive
cp .env.example .env
```

Edit `.env`:

```env
OPENRIVE_URL=https://openrive.example.com
OPENRIVE_SIGNUP=first
OPENRIVE_AUTH_SECRET=a-long-random-secret-at-least-32-characters
POSTGRES_PASSWORD=another-long-random-password
# Optional second gate:
# OPENRIVE_ACCESS_TOKEN=a-long-random-password
# OPENRIVE_PORT=3000
```

Start it:

```bash
docker compose up -d
```

Open `http://<server>:3000` (or `http://localhost:3000` with Docker Desktop).

What runs:

| Service | Image | Data |
| --- | --- | --- |
| `openrive` | `ghcr.io/upstandplatform/openrive:latest` | volume `openrive-data` (CLI imports/exports) |
| `db` | `postgres:17-alpine` | volume `openrive-db` |

Nothing is compiled on your server: the image is published for `linux/amd64` and `linux/arm64` and simply pulled.
See [Which image you get](#which-image-you-get) to pin a version or follow `main`.

Drizzle migrations run automatically when the app starts, and the app waits (up to `OPENRIVE_DB_WAIT_SECONDS`) while
PostgreSQL finishes starting beside it, so the order the two containers come up in does not matter.

### With Docker Desktop's UI

1. Run `docker compose up -d` once in the project folder (in a terminal or Docker Desktop's built-in terminal).
2. The **openrive** stack then appears under **Containers**, where you can start, stop, view logs and open port 3000.
3. Volumes (`openrive-db`, `openrive-data`) are listed under **Volumes** and can be backed up or exported there.

### Common commands

```bash
docker compose logs -f openrive           # logs
docker compose pull && docker compose up -d         # update to the newest image
docker compose down                       # stop (data is kept in volumes)
docker compose exec openrive openrive list          # use the CLI inside the container
docker compose exec openrive openrive users add Sam --role editor
```

### Which image you get

`ghcr.io/upstandplatform/openrive` is public — no registry sign-in — and is built for `linux/amd64` and
`linux/arm64` by the **Image** workflow.

| Tag | What it is |
| --- | --- |
| `latest` | the newest build, moved on every publish (default) |
| `1850d37` | the exact commit it was built from |
| `0.0.6`, `0.0` | a release, or the newest patch of that minor |

Pin a tag in `.env` to stay on one version:

```env
OPENRIVE_TAG=0.0.6
```

To run your own build instead of the published image — a fork, or a change to the `Dockerfile`:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

---

## Option B: single container, embedded database

No database service: OpenRive runs PostgreSQL (PGlite) inside the `/data` volume.

```bash
docker compose -f docker-compose.standalone.yml up -d
```

Or with plain Docker:

```bash
docker run -d --name openrive -p 3000:3000 \
  -e OPENRIVE_ACCESS_TOKEN=a-long-random-password \
  -v openrive-data:/data ghcr.io/upstandplatform/openrive:latest
```

Projects live in the embedded database inside the `openrive-data` volume, mounted at `/data`.

To use an existing PostgreSQL database instead, add `-e DATABASE_URL=postgres://user:pass@host:5432/openrive`.

---

## Option C: Bun without Docker

```bash
bun install --frozen-lockfile
bun run build
OPENRIVE_ACCESS_TOKEN=... bun run cli serve --host 0.0.0.0 --port 3000
```

Add `DATABASE_URL=postgres://…` to use a PostgreSQL server instead of the embedded database. Keep it running with a
process manager, for example systemd:

```ini
# /etc/systemd/system/openrive.service
[Unit]
Description=OpenRive
After=network.target

[Service]
WorkingDirectory=/opt/openrive
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=OPENRIVE_DATA_DIR=/var/lib/openrive
Environment=OPENRIVE_ACCESS_TOKEN=change-me
ExecStart=/usr/local/bin/bun run start
Restart=always
User=openrive

[Install]
WantedBy=multi-user.target
```

To build a standalone server bundle, which is what the Docker image uses, run `NEXT_OUTPUT=standalone bun run build`,
then `node .next/standalone/server.js` (copy `public/` and `.next/static/` next to it).

---

## Platforms that deploy from git (Dokploy, Coolify, …)

Point the platform at the repository and let it run `docker-compose.yml`. Set
`OPENRIVE_URL` to the public HTTPS domain, `POSTGRES_PASSWORD` to a strong
password, and either `OPENRIVE_AUTH_SECRET` to a strong 32+ character value or
leave it unset so OpenRive generates and persists one in the database. Keep
`OPENRIVE_SIGNUP=first` or `off` after the initial administrator is created.
The optional `OPENRIVE_ACCESS_TOKEN` adds HTTP Basic auth in front of the
application. The published image is pulled, so the deploy host does not need
to build the project.

These platforms clone with `--recurse-submodules`. The Rive SDK forks under `vendor/` are marked `update = none`, so
they are skipped: they are developer tooling, and one of them has an `ssh://` submodule that a build server cannot
read. If a platform forces submodules anyway and the clone fails with **"Host key verification failed"**, tell git to
use https instead of ssh on the build host:

```bash
git config --global url."https://github.com/".insteadOf "git@github.com:"
```

## HTTPS with a reverse proxy

Put OpenRive behind a proxy that handles TLS.

**Caddy** (automatic certificates):

```
openrive.example.com {
  reverse_proxy localhost:3000
}
```

**nginx:**

```nginx
server {
  listen 443 ssl http2;
  server_name openrive.example.com;
  ssl_certificate     /etc/letsencrypt/live/openrive.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/openrive.example.com/privkey.pem;
  client_max_body_size 100m;          # large .riv files and images
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Backups

| Mode | Backup | Restore |
| --- | --- | --- |
| PostgreSQL (compose) | `docker compose exec db pg_dump -U openrive openrive > openrive.sql` | `docker compose exec -T db psql -U openrive openrive < openrive.sql` |
| Embedded (volume) | `docker run --rm -v openrive-data:/data -v $PWD:/b alpine tar czf /b/openrive.tgz -C /data .` | extract back into the volume |
| Embedded (Bun) | copy `OPENRIVE_DATA_DIR` | copy it back |

Single projects travel as `.riv` files: `openrive export <project> file.riv` and `openrive import file.riv`.

## Upgrading from the old file storage

Projects stored by older versions in `data/projects/<id>/` are imported automatically the first time the new version
starts with an empty database, or by hand with `openrive db import`. See [Storage](storage.md#importing-the-old-file-storage).

## Health check

`GET /api/health` returns `{"ok":true,"storage":"postgres"}` (HTTP 200) when the app and its storage are working, and
503 otherwise. It needs no access token, and the Docker image uses it as its `HEALTHCHECK`.

## Resource usage

OpenRive is light: about 150 MB of RAM for the app, plus PostgreSQL. Rendering happens in each user's browser, not on
the server.

See also: [Configuration](configuration.md) · [Storage](storage.md) · [Troubleshooting](troubleshooting.md)
