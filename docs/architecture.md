# Architecture

OpenRive is a Next.js app (App Router, React 19, TypeScript, Tailwind, Zustand + Immer). The browser does all editing
and rendering. The server only stores documents.

```
                 ┌───────────── browser ─────────────────────────────────────┐
                 │  React UI (src/components)                                │
                 │     │ actions / shortcuts / menus                         │
                 │     ▼                                                     │
                 │  Zustand store (src/lib/store/editor.ts)                  │
                 │   doc: RiveDoc ── undo history, auto-keying               │
                 │     │                 │                                   │
                 │     ▼                 ▼                                   │
                 │  exportRiv()      StageEngine (src/lib/rive/engine.ts)    │
                 │     │             official Rive WASM renders the stage    │
                 └─────┼─────────────────────────────────────────────────────┘
                       │ REST (src/app/api)
                 ┌─────▼──────── server / tools ──────────────┐
                 │ storage-core → driver: file | postgres     │◄── CLI (tools/cli.ts)
                 │                                            │◄── MCP (tools/mcp-server.ts)
                 └────────────────────────────────────────────┘
```

## Layers

### Format layer: `src/lib/rive/`

| File | Role |
| --- | --- |
| `core-defs.json`, `schema.ts` | Every Rive object type and property, generated from rive-runtime's `dev/defs` (`scripts/generate-core-defs.js`) |
| `binary.ts`, `riv-format.ts` | Low-level reader/writer: header, table of contents, varuint/float/string/bytes/color fields, unknown-property preservation |
| `document.ts` | `importRiv` / `exportRiv`: turns the flat object stream into a tree (`RiveDoc` → artboards → objects, animations, state machines). Index references become stable ids and back again. |
| `ops.ts` | Structural edits: insert, delete, reparent, group, reorder, duplicate, copy/paste, keyframes, interpolation |
| `scene.ts` | Transforms, path geometry, bounds, hit testing (for the editor overlay) |
| `api.ts` | High-level, name-addressable API used by templates, CLI, MCP and the Code panel |
| `theme.ts`, `text.ts`, `assets.ts`, `svg.ts` | Theme colors, text objects and fonts, file assets, SVG import |
| `templates*.ts`, `examples.ts` | Starter content |
| `engine.ts`, `runtime.ts` | Loading the WASM runtime and drawing artboards on the stage |

Everything in this folder except `engine.ts`/`runtime.ts` is **DOM-free**, so it runs in Node for the CLI, MCP and
tests.

### Editor UI: `src/components/editor/`

`Editor.tsx` lays out the panels. `Stage.tsx` holds the canvas, SVG overlay, tools and inline text editing.
`Inspector.tsx`, `Hierarchy.tsx`, `ThemePanel.tsx`, `AssetsPanel.tsx`, `CodePanel.tsx`, `Timeline.tsx` and
`StateMachinePanel.tsx` are the other panels. `actions.ts` is the registry of commands (label, shortcut, enabled
state, run), used by shortcuts, menus and the shortcuts dialog. `ContextMenu.tsx` renders context menus from the
registry.

### State: `src/lib/store/editor.ts`

A single Zustand store holds the `RiveDoc` plus editor state (selection, tool, mode, playhead…). Mutations go
through `commit(recipe)` (Immer). Each commit is an undo step, and drags use gestures so one drag is one step. In
Animate mode, `setProps` keys animatable properties at the playhead.

### Rendering

The stage re-exports the document to `.riv` bytes on change and loads them into the official runtime
(`@rive-app/canvas-advanced`), so the canvas is exactly what users will ship. Selection outlines and handles are an SVG
overlay computed by `scene.ts`.

### Persistence

The editor autosaves `doc` (JSON with editor-only data such as theme links and scripts) together with the exported
`.riv` and a thumbnail through `PUT /api/projects/:id`. `src/lib/server/storage-core.ts` delegates to a driver:
`drivers/file.ts` (default) or `drivers/postgres.ts` (`DATABASE_URL`).

### Tools: `tools/`

`project-store.ts` wraps storage for Node. `cli.ts` is the `openrive` command, and `mcp-server.ts` is the MCP server
(`@modelcontextprotocol/sdk`, zod schemas). Both use `api.ts`. `bin/openrive.cjs` launches them with `tsx`.

### Access control

`src/proxy.ts` (Next 16's replacement for middleware) enforces `OPENRIVE_ACCESS_TOKEN` with HTTP Basic auth. Roles
(admin/editor/viewer) are enforced in the UI, since OpenRive assumes a trusted environment behind the token.

## Tests

| Command | Checks |
| --- | --- |
| `npm test` | Round-trip of generated files and every template (byte-identical re-export) |
| `npm run test:corpus -- <rive-runtime>/tests` | Round-trip of Rive's own 437 test files |
| `npm run test:mcp` | MCP server end to end |
| `npx tsx scripts/svg.test.ts` | SVG importer |
