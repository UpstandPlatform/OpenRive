# Storage & PostgreSQL

OpenRive has two interchangeable storage backends. The web app, CLI and MCP server all use the same one, chosen at
startup:

| Backend | Selected when | Good for |
| --- | --- | --- |
| **File** | default | Single user, laptops, NAS, easy backups |
| **PostgreSQL** | `DATABASE_URL` is set | Teams, servers, managed databases, concurrent tools |

Check which one is active:

```bash
openrive storage
# Backend:  postgres
# Location: postgres://openrive:***@localhost:5432/openrive
# Users:    3
# Projects: 42
```

or `GET /api/health` → `{"ok":true,"storage":"postgres"}`.

## File storage

```
$OPENRIVE_DATA_DIR (default ./data)
├── users.json
├── .seeded                     marks that the welcome project was created
└── projects/<id>/
    ├── meta.json               name, owner, sharing, stats, thumbnail
    ├── doc.json                editor document (objects + editor-only data: theme colors, scripts)
    └── file.riv                exported Rive file (what previews and downloads serve)
```

Writes are atomic (write to a temp file, then rename), so a crash never leaves a half-written file.

## PostgreSQL

```bash
DATABASE_URL=postgres://user:password@host:5432/openrive npm start
```

Any PostgreSQL 12+ works: the Docker Compose service, a local install, or managed services (Neon, Supabase, RDS,
Cloud SQL, …). Add `?sslmode=require` or `OPENRIVE_DB_SSL=true` for TLS.

Tables are created automatically, all prefixed `openrive_` so they can share a database:

| Table | Columns |
| --- | --- |
| `openrive_users` | `id` text PK, `position` int, `data` jsonb |
| `openrive_projects` | `id` text PK, `meta` jsonb, `doc` text, `riv` bytea, `updated_at` bigint |
| `openrive_settings` | `key` text PK, `value` jsonb |

## Migrating

`openrive migrate` copies all users and projects between any two stores. It never deletes anything from the source.

```bash
# files → PostgreSQL
openrive migrate --from ./data --to postgres://openrive:secret@localhost:5432/openrive

# PostgreSQL → files (a portable backup)
openrive migrate --from postgres://… --to ./openrive-backup

# with npm instead of a global install
npm run cli -- migrate --from ./data --to postgres://…
```

Projects with the same id in the target are overwritten. After migrating, start OpenRive with `DATABASE_URL` pointing
at the new database.

## Adding a backend

Backends implement the small `StorageDriver` interface in
[`src/lib/server/drivers/types.ts`](../src/lib/server/drivers/types.ts): read/write users, list/read/write/delete
projects, and a first-run flag. See `file.ts` and `postgres.ts` for reference, and
[contribution/development.md](../contribution/development.md).
