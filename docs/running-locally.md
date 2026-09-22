# Running OpenRive locally

OpenRive runs on your computer as a Bun + Next.js app. Nothing is sent anywhere, and there is no login.

## Requirements

- **[Bun](https://bun.sh) 1.4 or newer** — install with `curl -fsSL https://bun.sh/install | bash`, or on Windows
  `powershell -c "irm bun.sh/install.ps1 | iex"`
- Any modern browser (Chrome, Edge, Firefox, Safari)
- Windows, macOS or Linux

Check your version with `bun --version`. No separate Node.js install is needed.

## 1. Get the code

```bash
git clone https://github.com/UpstandPlatform/OpenRive.git
cd OpenRive
```

## 2. Install

```bash
bun install
```

This also copies the Rive WASM runtime into `apps/web/public/rive/`, so the editor works offline.

## 3. Run

### Development mode (hot reload)

```bash
bun run dev
```

### Production mode (faster, for everyday use)

```bash
bun run build
bun run start          # or: bun run cli serve
```

Open **http://localhost:3000**.

On first start OpenRive creates:

- a user called **Admin**, which you can rename on the Users page
- a **Welcome to OpenRive** project with the interactive logo

## The database

OpenRive stores everything in PostgreSQL through [Drizzle ORM](https://orm.drizzle.team).

- **No setup needed locally.** Without `DATABASE_URL`, OpenRive runs an embedded PostgreSQL
  ([PGlite](https://pglite.dev)) inside `data/pgdata`. Migrations are applied automatically at startup.
- **A real server** is one variable away:

  ```bash
  bun run db:up                                                     # starts PostgreSQL in Docker
  DATABASE_URL=postgres://openrive:openrive@localhost:5432/openrive bun run dev
  ```

Back your work up by copying the `data/` folder (embedded) or with `pg_dump` (server). See [Storage](storage.md).

> The embedded database belongs to one process at a time. Stop the dev server before running `bun run cli` against the
> same data folder, or point the CLI elsewhere with `--data` / `--db`.

## Where things live

```
apps/web        the editor (Next.js app: UI + REST API)
apps/cli        the openrive command (terminal UI) and the MCP server
apps/desktop    the desktop app (Electrobun)
packages/rive   the .riv format and editing core
packages/db     Drizzle schema, migrations and queries
packages/shared zod schemas, types and configuration
packages/ui     shared React components
data/           your projects (embedded database)
```

## Change the port or allow other devices

```bash
bun run cli serve --port 4000                 # another port
bun run cli serve --host 0.0.0.0              # reachable from your network
```

> If other people can reach the server, set `OPENRIVE_ACCESS_TOKEN`, because the app has no login. See
> [Self-hosting](self-hosting.md#before-you-start-protecting-access).

## Install the CLI globally (optional)

```bash
bun link
openrive              # interactive terminal UI
openrive --help
```

See [CLI](cli.md).

## Update

```bash
git pull
bun install
bun run build
```

Migrations run on the next start; your data is kept.

## Next steps

- [User guide](user-guide.md)
- [Keyboard shortcuts](shortcuts.md)
- [Connect an AI assistant with MCP](mcp.md)
- [Desktop app](desktop.md)
