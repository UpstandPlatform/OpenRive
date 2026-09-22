# Storage & PostgreSQL

OpenRive keeps users and projects in **PostgreSQL**, through [Drizzle ORM](https://orm.drizzle.team). There is one
schema and one set of migrations; only the connection differs:

| Mode | Selected when | Good for |
| --- | --- | --- |
| **Embedded** ([PGlite](https://pglite.dev)) | no `DATABASE_URL` | Local use and the desktop app: real PostgreSQL inside `data/pgdata`, no server to run |
| **Server** | `DATABASE_URL` is set | Teams, Docker, managed databases, several processes at once |

Check which one is active:

```bash
bun run cli db status
# Database: embedded PostgreSQL (PGlite)
# Location: D:\OpenRive\data\pgdata
# Users:    3
# Projects: 42
```

or `GET /api/health` → `{"ok":true,"storage":"embedded"}`.

> The embedded database allows a single process. Run either the app or the CLI against one data folder at a time. A
> `DATABASE_URL` server has no such limit.

## Tables

Created by the migrations in `packages/db/src/migrations`:

| Table | Columns |
| --- | --- |
| `users` | `id`, `name`, `color`, `role`, `created_at`, `position` |
| `projects` | `id`, `name`, `owner_id`, `created_at`, `updated_at`, `thumbnail`, `artboards`, `animations`, `state_machines`, `shared_with` (jsonb), `doc` (text), `riv` (bytea) |
| `settings` | `key`, `value` (jsonb) — first-run marker and housekeeping |
| `drizzle.__drizzle_migrations` | applied migrations |

`doc` is the editor document (JSON with base64 byte fields, including theme colors and scripts); `riv` is the exported
Rive file that previews and downloads serve.

## Connecting to a server

```bash
DATABASE_URL=postgres://user:password@host:5432/openrive bun run start
```

Any PostgreSQL 14+ works: the Docker Compose service, a local install, or a managed one (Neon, Supabase, RDS, Cloud
SQL…). Add `?sslmode=require` or `OPENRIVE_DB_SSL=true` for TLS. Migrations are applied automatically at startup.

For local development against a server instead of the embedded database:

```bash
bun run db:up      # PostgreSQL in Docker (docker-compose.dev.yml)
DATABASE_URL=postgres://openrive:openrive@localhost:5432/openrive bun run dev
bun run db:down
```

## Changing the schema

```bash
# edit packages/db/src/schema.ts, then:
bun run db:generate     # drizzle-kit generate + embeds the SQL for bundled runtimes
```

Commit both `packages/db/src/migrations/*` and `packages/db/src/migrations.generated.ts` (the embedded copy that
works inside the Next.js standalone build, the Docker image and the desktop bundle). CI fails if schema and
migrations disagree. `bun run db:migrate` and `bun run db:studio` are there for manual work.

## Importing the old file storage

Versions before the Drizzle refactor stored projects as files in `data/projects/<id>/`. They are imported
**automatically** the first time an empty database starts with that folder present. To run it by hand:

```bash
bun run cli db import            # uses the data folder
bun run cli db import ./old-data
```

Nothing is deleted: the folder stays as a backup.

## Backups

| Mode | Backup | Restore |
| --- | --- | --- |
| Embedded | copy the `data/` folder | copy it back |
| Server | `pg_dump -U openrive openrive > openrive.sql` | `psql -U openrive openrive < openrive.sql` |
| Either | `openrive export <project> file.riv` per project | `openrive import file.riv` |
