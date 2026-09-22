<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# OpenRive project notes

OpenRive is a local-first, login-free editor for Rive `.riv` files (Next.js 16, React 19, Zustand + Immer, official
Rive WASM runtime). Read `contribution/development.md` and `docs/architecture.md` before larger changes.

- **Never break files**: unmodified `.riv` files must round-trip byte-identical (`npm test`, `npm run test:corpus`).
- **One editing API**: content operations live in `src/lib/rive/api.ts` (DOM-free), shared by the UI, CLI
  (`tools/cli.ts`), MCP server (`tools/mcp-server.ts`) and the Code panel.
- **Editor commands** go in `src/components/editor/actions.ts`, and mutations go through `commit()` (one undo step).
- **Storage** goes through `src/lib/server/storage-core.ts` (file driver by default, PostgreSQL when `DATABASE_URL`
  is set).
- **Product name** is "OpenRive" in all user-visible text.
- Agents and skills for common tasks: `.claude/agents/`, `.claude/skills/` (see `contribution/ai-collaboration.md`).
- Verify UI changes in the browser on a scratch project. Don't modify or delete other people's projects in `data/`.
