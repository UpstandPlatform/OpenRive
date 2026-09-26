# Testing

## Automated

| Command | What it checks | Run when |
| --- | --- | --- |
| `bun run check-types` | Types across every package (Turborepo) | Always |
| `bun run lint` | ESLint (Next + React hooks rules) | Always |
| `bun run test` | Round-trip of generated files and **every template**, the SVG importer, and preview bundles | Always |
| `bun run test:mcp` | Starts the MCP server over stdio, creates, edits and exports a project | You touched `packages/rive/src/api.ts` or `apps/cli/` |
| `bun run test:corpus -- <rive-runtime>/tests` | Round-trips Rive's 437 test files | You touched `binary.ts`, `riv-format.ts`, `document.ts`, `schema.ts` |
| `bun run build` | Production build of the web app | Before opening a PR with UI or route changes |
| `bun run cli db status` | The database opens and migrations apply | You touched `packages/db` |

To get the corpus:

```bash
git clone --depth 1 https://github.com/rive-app/rive-runtime ../rive-runtime
bun run test:corpus -- ../rive-runtime/tests
```

## Validate files

```bash
bun run cli validate path/to/*.riv
```

Attach failing files to issues. They become regression tests.

## Manual checks (UI changes)

Test in the browser (`bun run dev`):

1. Create a file from a template, make the change, and **undo/redo** it.
2. **Reload**: the change is saved.
3. **Preview** (`Ctrl P`): the runtime plays it as expected.
4. **Export** and re-import the `.riv`.
5. Try the **keyboard** path and the **context menu** path.
6. Check a **read-only** user (Viewer) can't modify anything.
7. Resize the window: panels shouldn't overflow, and popovers shouldn't be clipped.

For database changes, run through both connections (`DATABASE_URL` unset for embedded PostgreSQL, and set for a
server — `bun run db:up` starts one).

## Writing tests

Tests are plain `tsx` scripts in `scripts/`. They print results and exit non-zero on failure, with no test framework.
Follow `roundtrip.test.ts`: build a document with the API, export, import, export again, compare bytes.
