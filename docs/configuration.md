# Configuration

OpenRive is configured with environment variables, validated with [zod](https://zod.dev) at startup — a bad value
stops the app with a message instead of failing later. Set them in your shell, in a `.env` file (copy `.env.example`),
or in `docker-compose.yml`.

## Storage

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | – | PostgreSQL connection URL. Without it, an embedded PostgreSQL (PGlite) runs inside the data folder. `OPENRIVE_DATABASE_URL` also works. |
| `OPENRIVE_DATA_DIR` | `./data` | Folder for the embedded database and CLI imports/exports. A relative path is resolved against the workspace root. |
| `OPENRIVE_DB_SSL` | `false` | `true` forces TLS (also enabled by `?sslmode=require` in the URL). Certificates are not verified, which suits managed databases with private CAs. |
| `OPENRIVE_DB_POOL` | `10` | Maximum database connections (server mode) |

## Access

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_ACCESS_TOKEN` | – | When set, every request needs HTTP Basic auth with this password (any user name). `/api/health` stays open. |

## Server

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (`bun run start`, `openrive serve`, Docker) |
| `HOSTNAME` | `localhost` (`0.0.0.0` in Docker) | Interface to listen on |
| `NEXT_OUTPUT` | – | `standalone` at build time produces the self-contained server used by Docker and the desktop app |

## Docker Compose

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_PORT` | `3000` | Host port published by compose |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `openrive` | Credentials of the bundled PostgreSQL. **Change the password.** |

## CLI, MCP and the desktop app

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_USER` | first admin | Owner (user id or name) for files created by the CLI and MCP tools |
| `OPENRIVE_URL` | `http://localhost:3000` | Base URL used in the editor links these tools print |

The CLI also accepts `--data <dir>` and `--db <url>` on any command.

## Legacy names

Earlier builds used `RIVE_EDITOR_DATA_DIR`, `RIVE_EDITOR_ACCESS_TOKEN` and `RIVE_EDITOR_USER`. They still work as
fallbacks.
