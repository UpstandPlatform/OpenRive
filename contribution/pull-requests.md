# Pull requests & reviews

## Before opening

- [ ] Linked issue (or a clear description of the problem)
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` pass
- [ ] Extra tests for your area (see [testing](testing.md))
- [ ] Docs updated
- [ ] Screenshots or a recording for UI changes

## What reviewers look for

1. **File safety**: no regressions in round-tripping, and new object types have tests.
2. **One API**: content features live in `src/lib/rive` and are reachable from UI, CLI and MCP where it makes sense.
3. **UX consistency**: shortcuts in the action registry, context menus, undo, read-only mode respected, no clipped
   popovers.
4. **Local-first**: no required network calls, telemetry or accounts.
5. **Readable code** matching the surrounding style.
6. **Scope**: one change per PR. Refactors go in separate PRs.

Reviews aim to be quick and kind. Small PRs get merged faster.

## AI-assisted PRs

Welcome, with the same bar as any PR. You're responsible for every line. See
[ai-collaboration.md](ai-collaboration.md#rules-for-ai-assisted-contributions).

## Releases

Maintainers tag releases as `vX.Y.Z` (semver) and summarize changes in the release notes. Anything that changes stored
data (the `doc.json` shape, the database schema) must stay backward compatible or include a migration.
