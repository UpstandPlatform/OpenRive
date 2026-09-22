---
name: verify-change
description: Run the right OpenRive checks for the files changed (types, lint, round-trip, corpus, MCP, build, and browser verification). Use before reporting a change as done or opening a PR.
---

# Verify a change

1. See what changed: `git diff --stat` (or the files you edited).
2. Always run:
   ```bash
   bun run check-types
   bun run lint
   bun run test
   ```
3. Then, by area:
   | Changed | Also run |
   | --- | --- |
   | `packages/rive/src/{binary,riv-format,document,schema}.ts`, `core-defs.json` | `bun run test:corpus -- ../rive-runtime/tests` |
   | `packages/rive/src/svg.ts` | `bun scripts/svg.test.ts` |
   | `packages/rive/src/api.ts`, `tools/**` | `bun run test:mcp` |
   | `src/lib/server/**` | `bun run cli storage` and a CLI create/export/delete cycle, with and without `DATABASE_URL` |
   | `apps/web/src/app/**`, `next.config.ts`, `apps/web/src/proxy.ts` | `bun run build` |
4. **UI changes**: start `bun run dev` and check in the browser: the happy path, undo/redo, reload persistence,
   Preview, keyboard and context-menu paths, and the Viewer role. Use a scratch project, not someone's real files,
   and delete it afterwards.
5. Scan scripted edits for stray control characters: `grep -rnP "[\x00-\x08]" src tools`.
6. Report what you ran and the results, including failures, with their output.
