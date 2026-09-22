# Configuration

OpenRive is configured with environment variables. Set them in your shell or in a `.env` file (copy `.env.example`),
or in `docker-compose.yml`. `.env` is read by `npm run dev`, `npm start` and `docker compose`.

## Storage

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_DATA_DIR` | `./data` | Folder for file storage (users.json and projects/) |
| `DATABASE_URL` | – | PostgreSQL connection URL. When set, users and projects are stored in Postgres. `OPENRIVE_DATABASE_URL` also works. |
| `OPENRIVE_DB_SSL` | `false` | `true` forces TLS (also enabled by `?sslmode=require` in the URL). Certificates are not verified, which suits managed databases with private CAs. |
| `OPENRIVE_DB_POOL` | `10` | Maximum database connections |

## Access

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_ACCESS_TOKEN` | – | When set, every request needs HTTP Basic auth with this password (any user name). `/api/health` stays open. |

## Server

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (`npm start`, `openrive serve`, Docker). Also used in editor links printed by the CLI/MCP. |
| `HOSTNAME` | `localhost` (`0.0.0.0` in Docker) | Interface to listen on |
| `NEXT_OUTPUT` | – | `standalone` at build time produces the self-contained server used by Docker |

## Docker Compose

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_PORT` | `3000` | Host port published by compose |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `openrive` | Credentials of the bundled Postgres. **Change the password.** |

## CLI & MCP

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_USER` | first admin | Owner (user id or name) for files created by the CLI and MCP tools |

The CLI also accepts `--data <dir>` and `--db <url>` on any command.

## Legacy names

Earlier builds used `RIVE_EDITOR_DATA_DIR`, `RIVE_EDITOR_ACCESS_TOKEN` and `RIVE_EDITOR_USER`. They still work as
fallbacks.
