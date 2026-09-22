---
name: add-mcp-tool
description: Expose an OpenRive editing capability to AI assistants as an MCP tool (apps/cli/src/mcp-server.ts) backed by packages/rive/src/api.ts, with a smoke test and docs. Use when adding automation surface area.
---

# Add an MCP tool

1. **API first**: make sure the operation exists in `packages/rive/src/api.ts`, taking `doc` first and accepting
   names or ids for references (use `getArtboard`, `getObject`, …). Throw `ApiError` with actionable messages.
2. **Register** in `apps/cli/src/mcp-server.ts` with the local `tool(name, description, zodShape, handler)` helper:
   - `name`: snake_case verb (`add_gradient`)
   - `description`: one sentence saying what it does and when to use it
   - zod shape: `project` plus precise optional fields with `.describe()` text
   - handler: `edit(project, (doc) => api.fn(doc, args))`, returning a compact result with an editor link
3. **Smoke test**: extend `scripts/mcp-smoke.test.ts` to call it, then run `bun run test:mcp`.
4. **CLI (optional)**: add a matching command in `apps/cli/src/index.ts` if it's useful from a terminal.
5. **Document**: add the tool to the table in `docs/mcp.md` and update the tool count there and in `README.md`.
