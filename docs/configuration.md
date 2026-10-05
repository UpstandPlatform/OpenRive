# Configuration

OpenRive is configured with environment variables, validated with [zod](https://zod.dev) at startup — a bad value
stops the app with a message instead of failing later. Set them in your shell, in a `.env` file (copy `.env.example`),
or in `docker-compose.yml`.

## Storage

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | – | PostgreSQL connection URL. Without it, an embedded PostgreSQL (PGlite) runs inside the data folder. `OPENRIVE_DATABASE_URL` also works. |
| `OPENRIVE_DATA_DIR` | `./data` | Folder for the embedded database and CLI imports/exports. A relative path is resolved against the workspace root. |
| `OPENRIVE_DB_SSL` | `false` | `true` forces TLS (also enabled by `?sslmode=require` in the URL). Certificates are verified by default. |
| `OPENRIVE_DB_SSL_CA` | – | Inline PEM certificate authority for a private PostgreSQL certificate. |
| `OPENRIVE_ALLOW_INSECURE_INTERNAL_SERVICES` | `false` | Explicitly allows plaintext/private-network PostgreSQL, Redis, and object storage in isolated Compose networks. Keep `false` for internet-connected services. |
| `OPENRIVE_DB_POOL` | `10` | Maximum database connections (server mode) |
| `OPENRIVE_DB_WAIT_SECONDS` | `60` | How long to wait for a PostgreSQL server that is still starting before giving up |
| `OPENRIVE_REDIS_URL` | – | Optional Redis URL for distributed rate limits, locks and ephemeral coordination. Use `rediss://` outside an explicitly isolated private network. |

`OPENRIVE_EDITION` is `local`, `self_hosted`, or `cloud`. If omitted, OpenRive infers `local` without `DATABASE_URL` and
`self_hosted` with it. Cloud is strict: it requires PostgreSQL, Redis, Better Auth, an HTTPS public URL in production,
and all object-storage settings below.

For cloud, `.riv` files are stored in an S3-compatible object store. Use `OPENRIVE_STORAGE_FORCE_PATH_STYLE=true` for
MinIO and `false` for AWS S3 or R2:

| Variable | Description |
| --- | --- |
| `OPENRIVE_STORAGE_ENDPOINT` | S3, R2, or MinIO endpoint |
| `OPENRIVE_STORAGE_REGION` | Provider region, usually `us-east-1` |
| `OPENRIVE_STORAGE_BUCKET` | Bucket name |
| `OPENRIVE_STORAGE_ACCESS_KEY_ID` | Provider access key |
| `OPENRIVE_STORAGE_SECRET_ACCESS_KEY` | Provider secret key |
| `OPENRIVE_STORAGE_FORCE_PATH_STYLE` | `true` for MinIO; `false` for AWS/R2 |

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
| `OPENRIVE_MCP_STATELESS` | `auto` | `auto` enables stateless HTTP MCP in cloud deployments so requests can reach any replica; set `false` only when a self-hosted load balancer guarantees session affinity. |

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

The regular `docker-compose.yml` is self-hosted. The private cloud stack is `docker-compose.cloud.yml`; it adds
persistent MinIO object storage while keeping Redis memory-only. It requires `OPENRIVE_URL`, `OPENRIVE_AUTH_SECRET`,
`POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD`.
The cloud stack defaults `OPENRIVE_SIGNUP` to `open` so users can create accounts; the first account is still the
administrator. Set it to `first` or `off` when the deployment should restrict account creation.

## CLI, MCP and the desktop app

| Variable | Default | Description |
| --- | --- | --- |
| `OPENRIVE_USER` | first admin | Owner (user id or name) for files created by the CLI and MCP tools |
| `OPENRIVE_URL` | `http://localhost:3000` | Base URL used in the editor links these tools print |

The web MCP endpoint is `POST/GET/DELETE /api/mcp`. Authenticated self-hosted and cloud instances use Better Auth
MCP API keys; create one with `POST /api/mcp/keys` from a signed-in browser session and pass it as a Bearer token.
The local desktop app exposes the same endpoint on its per-run `127.0.0.1` origin and does not require a key by
default. Remote `.riv` imports use base64 bytes over MCP, while local stdio MCP may use file paths.

The CLI also accepts `--data <dir>` and `--db <url>` on any command.

## Legacy names

Earlier builds used `RIVE_EDITOR_DATA_DIR`, `RIVE_EDITOR_ACCESS_TOKEN` and `RIVE_EDITOR_USER`. They still work as
fallbacks.
