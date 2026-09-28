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
| `OPENRIVE_DB_WAIT_SECONDS` | `60` | How long to wait for a PostgreSQL server that is still starting before giving up |
| `OPENRIVE_REDIS_URL` | – | Optional Redis URL for distributed rate limits, locks and ephemeral coordination. The Compose stack uses `redis://redis:6379`. |

## Access

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_AUTH` | `auto` | `auto` requires a sign-in when `DATABASE_URL` is set, `on` always requires one, `off` never does. See [Accounts and sign-in](authentication.md). |
| `OPENRIVE_URL` | `http://localhost:3000` | Public origin used by authentication and CLI/editor links. Set this to the HTTPS domain in production. |
| `OPENRIVE_TRUSTED_ORIGINS` | `OPENRIVE_URL` | Comma-separated browser origins trusted by Better Auth. |
| `OPENRIVE_SESSION_DAYS` | `30` | How long a sign-in lasts |
| `OPENRIVE_AUTH_SECRET` | generated | Optional 32+ character secret. If omitted, a durable secret is generated in the database. |
| `OPENRIVE_SIGNUP` | `first` | `open`, `first`, or `off`; use `first` or `off` on public deployments. |
| `OPENRIVE_ACCESS_TOKEN` | – | When set, every request needs HTTP Basic auth with this password (any user name). `/api/health` stays open. Can be combined with accounts. |

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
