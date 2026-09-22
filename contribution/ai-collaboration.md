# AI collaboration: agents & skills

OpenRive is built to work well with AI coding assistants, both for **contributing code** and for **making
animations**. This repo ships shared configuration so every contributor's assistant knows the project's rules.

## What's included

| Path | What |
| --- | --- |
| `AGENTS.md` / `CLAUDE.md` | Project instructions read automatically by Claude Code, Codex, Cursor and other agents |
| `.claude/agents/*.md` | **Subagents**: specialized reviewers and helpers |
| `.claude/skills/*/SKILL.md` | **Skills**: step-by-step playbooks for recurring tasks |
| `.mcp.json` | The OpenRive **MCP server**, so assistants can create and inspect `.riv` projects |

### Agents

Agents are focused assistants with their own instructions. Ask your assistant to use them by name ("use the
format-guardian agent to review this diff").

| Agent | Use it to |
| --- | --- |
| `format-guardian` | Review changes to the `.riv` format layer for round-trip safety, reference spaces and draw order |
| `ui-reviewer` | Review editor UI changes: actions and shortcuts, context menus, undo, read-only mode, overflow, theming |
| `template-author` | Design and build a new starter template with the OpenRive API and verify it in Preview |
| `docs-writer` | Update `docs/` and `contribution/` to match a code change, in the project's style |

### Skills

Skills are playbooks that an agent loads when a task matches. In Claude Code, invoke them with `/skill-name` or
just describe the task.

| Skill | Does |
| --- | --- |
| `add-editor-action` | Adds a command to the action registry, with shortcut, menu entry and docs |
| `add-template` | Creates a template end to end: build, register, test, document |
| `add-mcp-tool` | Exposes an `api.ts` function as an MCP tool and CLI option, with tests |
| `verify-change` | Runs the right checks for the files you changed, including browser verification |
| `riv-debug` | Investigates a `.riv` that doesn't round-trip or render correctly |

## Using the MCP server while developing

With `.mcp.json`, your assistant can call OpenRive directly, for example: "create a project from the
`interactive-button` template, add a third state, and export it". That's handy for reproducing bugs and for testing
API changes. See [docs/mcp.md](../docs/mcp.md).

## Rules for AI-assisted contributions

1. **You own the PR.** Read and understand every line before submitting, and be ready to explain it in review.
2. **Say so.** Mention in the PR description that AI tools were used, and for what.
3. **Verify for real.** Run the checks in [testing.md](testing.md) and look at the result in the browser. Include the
   output or screenshots. "It compiles" isn't enough for UI or format changes.
4. **No invented APIs.** Next.js 16, the Rive runtime and the MCP SDK change often. Check the installed versions
   (`node_modules/next/dist/docs/`, the `.d.ts` files) instead of relying on memory.
5. **Small, focused diffs.** Don't let an agent reformat or refactor unrelated files.
6. **No secrets or personal data** in prompts, fixtures, or committed files.
7. **Licensing.** Don't paste code or assets from sources whose license is incompatible with MIT.

## Adding your own agents and skills

- **Agent**: add `.claude/agents/<name>.md` with frontmatter (`name`, `description`, optional `tools`) and focused
  instructions. The description should say when to use it.
- **Skill**: add `.claude/skills/<name>/SKILL.md` with frontmatter (`name`, `description`) and numbered steps.
  Reference real files and commands.
- Keep them **project-specific**: generic advice belongs in the assistant, not here. Open a PR like any other change.

Other assistants can use these files too: they're plain Markdown. Point Cursor rules or Codex instructions at
`AGENTS.md` and the skill files.
