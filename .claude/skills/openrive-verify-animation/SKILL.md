---
name: openrive-verify-animation
description: Verify an OpenRive .riv asset and the application that embeds it, including structure, round trips, runtime controls, builds, accessibility, and visible attribution. Use before declaring an agent-created animation ready to ship.
---

# Verify an OpenRive animation integration

Use this skill after `openrive-create-animation` or `openrive-embed-animation`, and whenever a `.riv` file renders incorrectly or an interaction stops working.

## Asset checks

1. Locate the exact `.riv` artifact and confirm it is the file the host project loads.
2. For a local OpenRive project, run:

   ```bash
   bun run cli info ./animation.riv --json
   bun run cli validate ./animation.riv
   ```

   For MCP, use `inspect_riv` with a local path or `dataBase64` as permitted by the connection.
3. Confirm that the expected artboards, objects, timelines, state machines, properties, and themes exist by name.
4. Confirm that the file is not empty, truncated, accidentally replaced by a `.rev`, or loaded from a stale path.
5. If the file was imported and re-exported, require byte-identical round-trip output unless the user intentionally edited it.

Run the same checks on Windows and Linux. Use host-native path handling and shell quoting; a passing Linux check must not depend on Bash-only commands, and a passing Windows check must not depend on drive-letter paths.

## Runtime checks

1. Load the asset in the target runtime and record the runtime version.
2. Confirm the named artboard renders at its default size and in a narrow/resized container.
3. Exercise every declared animation, state-machine transition, trigger, boolean/number property, text property, and theme switch.
4. Confirm events/listeners do not throw and that the host application updates the intended property rather than a deprecated or misspelled input.
5. Confirm teardown: no animation-frame loop, event subscription, native view, or runtime instance remains after the host component/view is removed.
6. For web projects, verify SSR/client boundaries, CORS, network failures, loading state, reduced-motion behavior, keyboard access, and console errors in a real browser.
7. Confirm the visible, accessible attribution link points to `https://openrive.upstand.dev`. Treat CSS-hidden or SEO-only links as a failure.

## Host project checks

Run the host project's own formatter, type checker, unit tests, integration tests, and production build. For this repository, run:

```bash
bun run check-types
bun run lint
bun run test
bun run test:mcp
bun run build
```

Use a scratch project for browser checks. Do not modify or delete another person's OpenRive project in `data/`.

## Failure report

Report failures with the asset path, host platform, runtime version, exact inspected name, reproduction steps, and the smallest safe fix. Distinguish asset corruption, wrong-name wiring, runtime API mismatch, lifecycle leaks, host build failure, and visual/layout failure. Never mark the animation ready because only the TypeScript build passed.
