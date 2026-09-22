<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# OpenRive project notes

OpenRive is a local-first, login-free editor for Rive `.riv` files, built as a
[Better-T-Stack](https://better-t-stack.dev) monorepo: **Bun** workspaces + Turborepo, Next.js 16 / React 19,
Zustand + Immer, Drizzle ORM on PostgreSQL, zod validation, and the official Rive WASM runtime.
Read `contribution/development.md` and `docs/architecture.md` before larger changes.

```
apps/web      editor UI + REST API        packages/rive    .riv format & editing core (DOM-free)
apps/cli      openrive CLI/TUI + MCP      packages/db      Drizzle schema, migrations, queries
apps/desktop  Electrobun desktop app      packages/shared  zod schemas: types, API, env
                                          packages/ui      shared React components
```

- **Bun everywhere**: `bun install`, `bun run dev|build|test|lint|check-types`, `bun run cli …`. No npm/pnpm/yarn.
- **Never break files**: unmodified `.riv` files must round-trip byte-identical (`bun run test`, `bun run test:corpus`).
- **One editing API**: content operations live in `packages/rive/src/api.ts`, shared by the UI, CLI, MCP and Code panel.
- **Validate with zod** at every edge (`packages/shared`); infer types from schemas rather than declaring them twice.
- **Database only through `packages/db`**; change the schema with `bun run db:generate` and commit the migration plus
  `migrations.generated.ts`.
- **Editor commands** go in `apps/web/src/components/editor/actions.ts`; mutations go through `commit()` (one undo step).
- **Reuse `packages/ui`** (Modal, Tabs, ListRow, PanelHeader) instead of copying panel or dialog markup.
- **Product name** is "OpenRive" in all user-visible text.
- Agents and skills for common tasks: `.claude/agents/`, `.claude/skills/` (see `contribution/ai-collaboration.md`).
- Verify UI changes in the browser on a scratch project. Don't modify or delete other people's projects in `data/`.
- The embedded database allows one process at a time: stop the dev server before running the CLI on the same folder.
