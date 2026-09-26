# Development

## Setup

Requirements: [Bun](https://bun.sh) 1.4+ and git. Optional: Docker (to test the PostgreSQL service and the image).

```bash
bun install
bun run dev
```

Useful URLs: `/` (files), `/users`, `/editor/<id>`, `/preview/<id>`, `/api/health`.

The Rive SDKs are vendored as git submodules in `vendor/`, but nothing needs them for day-to-day work: the editor
renders with the `@rive-app/canvas-advanced` npm package that `bun install` copies into `apps/web/public/rive`. Run
`bun run rive:init` when you want them, and see [Rive SDK submodules](../docs/rive-sdk.md) for updating the forks or
rendering with your own build.

In development, the editor store is exposed as `window.__riveEditor` for debugging in the browser console:

```js
__riveEditor.getState().doc            // the current RiveDoc
__riveEditor.getState().selection
```

> This repo is a **Bun workspace** driven by Turborepo: `bun install` at the root, and `bun run <script>` from the
> root for cross-package tasks. It uses **Next.js 16**. APIs differ from older versions: route handler `params` are a Promise, `proxy.ts`
> replaces middleware, and `PageProps`/`RouteContext` types are generated. Check `node_modules/next/dist/docs/` when
> in doubt (see `AGENTS.md`).

## Project layout

```
src/
  app/                    pages (files, users, editor, preview) + REST API (app/api)
  components/             shared UI (header, template gallery, player, toaster)
  components/editor/      editor panels, stage, actions registry, menus, dialogs
  lib/rive/               format + editing core (DOM-free except engine/runtime)
  lib/store/editor.ts     Zustand store: document, history, selection, modes
  lib/client/             browser helpers (session, prefs, fonts, toasts)
  lib/server/             storage-core + drivers (file, postgres)
  proxy.ts                optional access token
apps/cli/                 CLI (OpenTUI), MCP server, shared project store
scripts/                  tests and generators
apps/cli/src/index.ts          launcher (tsx)
docs/                     user & operator documentation
contribution/             these guides
.claude/                  agents and skills for AI-assisted contributions
```

See [docs/architecture.md](../docs/architecture.md) for the data flow.

## How a feature flows

Most features touch these layers, in this order:

1. **Core** (`packages/rive/src/*.ts`): a pure function that edits a `RiveDoc`. Keep it DOM-free and name-addressable when
   it's user-facing (see `api.ts`). Add a round-trip test if it creates new object types.
2. **CLI / MCP** (`apps/cli/`): expose it if it's useful for automation (`registerTool` in `mcp-server.ts`).
3. **UI**: call it inside `useEditor.getState().commit((doc) => …)`, so it's one undo step.
4. **Action** (`apps/web/apps/web/src/components/editor/actions.ts`): register a command with label, category, default keys, `when`,
   `enabled` and `run`. Menus and the shortcuts dialog pick it up automatically.
5. **Docs**: update `docs/`.

### Adding an action

```ts
{ id: 'object.center', label: 'Center on artboard', category: 'Arrange', keys: ['Alt+C'], edits: true,
  enabled: hasSelection, run: () => st().commit((doc) => centerSelection(doc, st().selection)) },
```

Then reference it in a context menu with `act('object.center')` in `menus.ts`.

### Adding a left panel tab

The tab list is in `Editor.tsx` (`leftTab`), and the store type is `leftTab` in `editor.ts`. See `AssetsPanel.tsx`
for a complete example with import, context menus and drag and drop.

### Changing the database

Edit `packages/db/src/schema.ts`, then run `bun run db:generate`: drizzle-kit writes the SQL migration and
`scripts/embed-migrations.ts` embeds it so bundled runtimes (standalone server, Docker, desktop) can apply it. Commit
both. Queries belong in `packages/db/src/repository.ts` — nothing else talks to the database. Test both connections:

```bash
bun run cli db status                                   # embedded PostgreSQL
bun run db:up
DATABASE_URL=postgres://openrive:openrive@localhost:5432/openrive bun run cli db status
```

### Working with the format

- Object types and properties come from `core-defs.json`. To update to a newer runtime, run
  `bun scripts/generate-core-defs.js <rive-runtime>/dev/defs`.
- Index references between objects are converted to ids in `document.ts` (`REF_SPACES`). New reference properties
  must be registered there.
- Array order is draw order (earlier draws on top), so use `insertObjects` / `moveBefore` from `ops.ts`.
- Inspect any file: `bun scripts/dump.ts file.riv`.

## Testing PostgreSQL locally

```bash
bun run db:up          # docker-compose.dev.yml
DATABASE_URL=postgres://openrive:openrive@localhost:5432/openrive bun run dev
bun run db:down
```

## Building the Docker image

```bash
docker build -t openrive .
docker compose up -d            # app + postgres
```

## Building the desktop app

```bash
bun run --cwd apps/desktop build:server    # Next.js standalone bundle
bun run build:desktop                      # Electrobun installers in apps/desktop/artifacts
```

Electrobun builds only for the host platform; CI builds all three (`.github/workflows/desktop.yml`).
