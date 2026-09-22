# Testing

## Automated

| Command | What it checks | Run when |
| --- | --- | --- |
| `npx tsc --noEmit` | Types | Always |
| `npm run lint` | ESLint (Next + React hooks rules) | Always |
| `npm test` | Generated files and **every template** export → import → export byte-identical | Always |
| `npx tsx scripts/svg.test.ts` | SVG importer | You touched `svg.ts` |
| `npm run test:mcp` | Starts the MCP server over stdio, creates, edits and exports a project | You touched `api.ts`, `tools/` |
| `npm run test:corpus -- <rive-runtime>/tests` | Round-trips Rive's 437 test files | You touched `binary.ts`, `riv-format.ts`, `document.ts`, `schema.ts` |
| `npm run build` | Production build | Before opening a PR with UI or route changes |

To get the corpus:

```bash
git clone --depth 1 https://github.com/rive-app/rive-runtime ../rive-runtime
npm run test:corpus -- ../rive-runtime/tests
```

## Validate files

```bash
npm run cli -- validate path/to/*.riv
```

Attach failing files to issues. They become regression tests.

## Manual checks (UI changes)

Test in the browser (`npm run dev`):

1. Create a file from a template, make the change, and **undo/redo** it.
2. **Reload**: the change is saved.
3. **Preview** (`Ctrl P`): the runtime plays it as expected.
4. **Export** and re-import the `.riv`.
5. Try the **keyboard** path and the **context menu** path.
6. Check a **read-only** user (Viewer) can't modify anything.
7. Resize the window: panels shouldn't overflow, and popovers shouldn't be clipped.

For storage changes, run through both backends (`DATABASE_URL` unset and set).

## Writing tests

Tests are plain `tsx` scripts in `scripts/`. They print results and exit non-zero on failure, with no test framework.
Follow `roundtrip.test.ts`: build a document with the API, export, import, export again, compare bytes.
