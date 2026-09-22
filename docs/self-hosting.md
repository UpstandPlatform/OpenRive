# Self-hosting OpenRive

Run OpenRive on a server, NAS or your own Docker Desktop so a team can share it. Three options:

| Option | Database | Best for |
| --- | --- | --- |
| [Docker Compose + PostgreSQL](#option-a-docker-compose--postgresql-recommended) | PostgreSQL service | Teams and servers (recommended) |
| [Docker, single container](#option-b-single-container-embedded-database) | Embedded (PGlite) in a volume | Personal use, NAS, quick trials |
| [Bun without Docker](#option-c-bun-without-docker) | Either | Servers where you manage the runtime yourself |

## Before you start: protecting access

OpenRive has no login, by design. Any visitor can pick a user and edit. When the server is reachable by anyone other
than you, **set an access token**:

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
OPENRIVE_ACCESS_TOKEN=a-long-random-password
POSTGRES_PASSWORD=another-long-random-password
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
| `openrive` | built from the `Dockerfile` (Bun) | volume `openrive-data` (CLI imports/exports) |
| `db` | `postgres:17-alpine` | volume `openrive-db` |

Drizzle migrations run automatically when the app starts.

### With Docker Desktop's UI

1. Run `docker compose up -d` once in the project folder (in a terminal or Docker Desktop's built-in terminal).
2. The **openrive** stack then appears under **Containers**, where you can start, stop, view logs and open port 3000.
3. Volumes (`openrive-db`, `openrive-data`) are listed under **Volumes** and can be backed up or exported there.

### Common commands

```bash
docker compose logs -f openrive           # logs
docker compose pull && docker compose up -d --build   # update after git pull
docker compose down                       # stop (data is kept in volumes)
docker compose exec openrive openrive list          # use the CLI inside the container
docker compose exec openrive openrive users add Sam --role editor
```

---

## Option B: single container, embedded database

No database service: OpenRive runs PostgreSQL (PGlite) inside the `/data` volume.

```bash
docker compose -f docker-compose.standalone.yml up -d
```

Or with plain Docker:

```bash
docker build -t openrive .
docker run -d --name openrive -p 3000:3000 \
  -e OPENRIVE_ACCESS_TOKEN=a-long-random-password \
  -v openrive-data:/data openrive
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
