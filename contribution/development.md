# Development

## Setup

Requirements: Node.js 20.9+ (22 recommended), git. Optional: Docker (to test PostgreSQL and the image).

```bash
npm install
npm run dev
```

Useful URLs: `/` (files), `/users`, `/editor/<id>`, `/preview/<id>`, `/api/health`.

In development, the editor store is exposed as `window.__riveEditor` for debugging in the browser console:

```js
__riveEditor.getState().doc            // the current RiveDoc
__riveEditor.getState().selection
```

> This repo uses **Next.js 16**. APIs differ from older versions: route handler `params` are a Promise, `proxy.ts`
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
tools/                    CLI, MCP server, Node project store
scripts/                  tests and generators
bin/openrive.cjs          launcher (tsx)
docs/                     user & operator documentation
contribution/             these guides
.claude/                  agents and skills for AI-assisted contributions
```

See [docs/architecture.md](../docs/architecture.md) for the data flow.

## How a feature flows

Most features touch these layers, in this order:

1. **Core** (`src/lib/rive/*.ts`): a pure function that edits a `RiveDoc`. Keep it DOM-free and name-addressable when
   it's user-facing (see `api.ts`). Add a round-trip test if it creates new object types.
2. **CLI / MCP** (`tools/`): expose it if it's useful for automation (`registerTool` in `mcp-server.ts`).
3. **UI**: call it inside `useEditor.getState().commit((doc) => …)`, so it's one undo step.
4. **Action** (`src/components/editor/actions.ts`): register a command with label, category, default keys, `when`,
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

### Adding a storage driver

Implement `StorageDriver` (`src/lib/server/drivers/types.ts`), select it in `storage()` in `storage-core.ts`, and
make `createDriver()` recognize its URL so `openrive migrate` works. Test with the CLI:

```bash
openrive --db <url> storage
openrive migrate --from ./data --to <url>
```

### Working with the format

- Object types and properties come from `core-defs.json`. To update to a newer runtime, run
  `node scripts/generate-core-defs.js <rive-runtime>/dev/defs`.
- Index references between objects are converted to ids in `document.ts` (`REF_SPACES`). New reference properties
  must be registered there.
- Array order is draw order (earlier draws on top), so use `insertObjects` / `moveBefore` from `ops.ts`.
- Inspect any file: `npx tsx scripts/dump.ts file.riv`.

## Testing PostgreSQL locally

```bash
docker run -d --name openrive-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17-alpine
DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres npm run dev
```

## Building the Docker image

```bash
docker build -t openrive .
docker compose up -d            # app + postgres
```
