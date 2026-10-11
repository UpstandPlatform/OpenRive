# Changelog

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
