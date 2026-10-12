# Changelog

## 0.1.5 - 2026-10-12

### Accounts and email

- Keep the email verification page accessible before sign-in so unverified cloud accounts can request and complete verification.

## 0.1.4 - 2026-10-12

### Accounts and email

- Require verified email ownership before cloud users can access OpenRive, including through existing sessions and MCP/API keys.
- Send branded verification and workspace invitation emails through Resend; add a page for requesting another verification link.
- Require `RESEND_API_KEY` and a verified `OPENRIVE_EMAIL_FROM` sender in cloud deployments.

## 0.1.3 - 2026-10-11

### Rigging

- Correct skin and tendon bind matrices to match the official Rive runtime; deformed contours, bounds, vertex picking, and cubic handles now share that evaluation.
- Add canvas weight painting with radius, strength, add/subtract modes, independent handle targets, normalized four-bone influences, and one undo step per stroke.
- Add bone parent controls, auto weighting, topology-aware mesh smoothing, rebind pose, and unbind with the current contour preserved.
- Fix scaled and mirrored tip edits, handle grab offsets, child linking from unselected tips, selection beyond artboard bounds, and interrupted gestures.
- Reject parent changes that would introduce unsupported shear or discard animated root positioning; validate auto weighting before making changes.
- Safely bake affected skins when deleting bound bones and report invalid skin references or weights in file diagnostics.
- Expose the rigging operations through the shared API and seven new MCP tools.

### Verification and rendering

- Flush deferred drawing before saving software-rendered PNGs; add an optional local Chromium renderer for embedded images and image meshes.
- Add 27 focused bone scenarios, 25 real browser canvas and Inspector scenarios, and official-runtime pixel checks for vector and image skinning, scaling, mirroring, rebind, and unbind.
- Run browser rigging checks in CI and release validation; preserve byte-identical round-trips across the Rive corpus.
- Keep UI typography on bundled IBM Plex Sans and remove the Inter UI fallback; Inter remains available as an editable project font.

## 0.1.2 - 2026-10-11

### Editor

- Create bones on the canvas, select and reposition them, edit bone tips, and validate weighted skinning through the shared editing API.
- Expand bone editor scenario coverage for hierarchy transforms, hit testing, positioning, rotation, creation, and edge cases.

### Accounts and collaboration

- Centralize account and workspace capabilities so UI, API, CLI, MCP, and repository operations enforce the same role policy.
- Keep account roles independent from active workspace roles, refresh MCP authorization context per request, and bind stateful sessions to their selected workspace.
- Protect the final active administrator from concurrent demotion or deletion and apply workspace membership permissions consistently.

### Reliability

- Add role and permission matrix tests, strengthen MCP smoke-test cleanup, and document the authorization boundaries.

## 0.1.1 - 2026-10-11

### Workspaces

- Add owner-only workspace deletion in a typed-confirmation Danger zone; projects and invitations are removed safely, active sessions return to Personal, and personal projects remain untouched.

### Rigging

- Select bones directly on the canvas, move their roots, and drag selected tips to adjust length and rotation in one undoable gesture.
- Clarify the current bone and skin editing scope in the user and file-format guides.

## 0.1.0 - 2026-10-11

### Editor

- Author and rename artboard view models, edit data property defaults, and use data properties directly in state-machine conditions and listener actions.
- Create named Rive events with number, boolean, string, and color payload fields. Listeners can report and react to those events.
- Add 1D blend states, select their numeric parameter, and edit the timeline/value pairs in the inspector.
- Add and edit distance constraints with closer-than, farther-than, and exact-distance rules.
- Smart guides, ruler guides, smoother drawing and selection, and corpus round-trip checks in CI.

### Tools and maintenance

- Add MCP tools for named events, 1D blend states, and distance constraints; project inspection now includes those elements.
- Update MCP and transitive dependencies, including the MCP SDK security update.

### Accounts and collaboration

- Add private workspaces with owner, administrator, editor, and viewer roles.
- Invite verified email addresses, manage membership, and transfer workspace ownership safely.
- Scope projects and API-key access to the selected workspace; configure SMTP to enable invitations and verification emails.
- Add workspace project filters and navigation, plus responsive member management.

See the [data binding guide](docs/data-binding.md), [user guide](docs/user-guide.md), and [MCP guide](docs/mcp.md) for details.
