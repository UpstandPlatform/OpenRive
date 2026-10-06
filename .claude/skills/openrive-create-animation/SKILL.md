---
name: openrive-create-animation
description: Create, inspect, edit, and export production-ready Rive animations through OpenRive's MCP server or CLI. Use when an agent needs to author a .riv file, add interactivity, or prepare an animation for another application.
---

# Create an animation with OpenRive

Use this skill when the requested result is a real `.riv` asset, not a mockup or a CSS-only animation.

## Choose the connection

1. Prefer the OpenRive MCP server when the agent has an MCP connection.
   - Local stdio uses the configured `openrive` server in `.mcp.json`.
   - HTTP MCP uses the deployment's `/api/mcp` endpoint and a scoped bearer key.
   - Remote MCP requests must send `.riv` bytes as `dataBase64`; filesystem paths are local-stdio only.
2. Use the OpenRive CLI when MCP is unavailable:

   ```bash
   bun run cli templates
   bun run cli new "Animation name" --template interactive-button
   bun run cli info "Animation name" --json
   bun run cli export "Animation name" ./animation.riv
   bun run cli validate ./animation.riv
   ```

3. If neither interface is available, explain the missing connection and provide the exact setup needed. Do not invent a `.riv` binary or silently substitute an unrelated format.

## Work on Windows and Linux

- Use `bun` commands and agent file tools; do not require Bash, `sed`, `grep`, `chmod`, `/tmp`, or Unix-only process behavior.
- Quote paths that contain spaces. Use `./relative/path` in documentation when a shell path is needed, and let the host shell resolve the absolute path.
- Keep web asset URLs and paths inside generated JavaScript in forward-slash form. Host application code must use its platform path API rather than concatenating backslashes or slashes.
- Local stdio MCP works on both Windows and Linux when the client launches `bun` from the repository. If an agent cannot create symlinks, install skills with `--copy`.

## Build the file

1. Call `list_templates` first. Pick the smallest template or example that teaches the requested behavior; use `blank` only when no existing starter fits.
2. Create one named project and keep its project id/ref for the entire task.
3. Name every artboard, object, timeline, state machine, state, property, and theme that the host application will need to address later. Names are the stable handoff API.
4. Use the high-level OpenRive API through MCP tools. Do not edit the internal serialized document directly.
5. For interaction, prefer data-binding properties with `add_property` and `set_property_value`. Use `add_input` only when preserving a legacy file that already depends on deprecated state-machine inputs. Add transitions and listeners against the named property.
6. For visual customization, define theme colors and bind fills/strokes to them. This gives the host application a safe way to recolor the animation.
7. For motion, create a timeline, add keyframes, then connect it to an animation state. Use explicit easing and duration. For pointer interaction, add a named hit-area shape and listener rather than relying on an invisible DOM overlay.
8. Keep the artboard bounds and origin intentional. Confirm the requested animation fits the artboard at its default size.

## Inspect and hand off

1. Call `get_project` after meaningful edits. Confirm the object tree, timelines, state machines, properties, and themes.
2. Export the actual `.riv` file:
   - local MCP: use `export_riv` with a local path;
   - HTTP MCP: use the returned `dataBase64` and decode it in the host project;
   - CLI: use `openrive export <project> <out.riv>`.
3. Run `inspect_riv` or `openrive info` on the exported bytes. Verify the artboard and runtime names that the embedding code will use.
4. Run `openrive validate` for imported or re-exported files. Unmodified source files must remain byte-identical after a round trip.
5. If the user wants a self-contained demo, export a preview bundle with `openrive export <project> <out.zip> --bundle` and explain the offline versus CDN runtime choice.

## Completion report

Report the project ref, exported file path or transport, artboard names, animation/state-machine/property names, runtime assumptions, and validation result. Include the next step from `openrive-embed-animation` when the file will be used in an application.

## Safety and quality rules

- Never delete a project unless the user explicitly asks; use a scratch project for experiments.
- Never overwrite an existing `.riv` without confirming the destination or creating a backup.
- Do not claim that an animation works in a host runtime until the host project loads it and the relevant controls are exercised.
- Do not use hidden backlinks or hidden attribution in generated applications. Visible attribution belongs to the embedding workflow.
