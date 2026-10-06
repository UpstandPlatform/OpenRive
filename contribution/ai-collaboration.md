# AI collaboration: agents & skills

OpenRive is built to work well with AI coding assistants, both for **contributing code** and for **making and shipping
animations**. This repo ships project-specific skills that agents can install with the open skills ecosystem.

## What's included

| Path | What |
| --- | --- |
| `AGENTS.md` / `CLAUDE.md` | Project instructions read automatically by Claude Code, Codex, Cursor and other agents |
| `.claude/agents/*.md` | **Subagents**: specialized reviewers and helpers |
| `.claude/skills/*/SKILL.md` | **Skills**: step-by-step playbooks for contributing to OpenRive or using it from another project |
| `.mcp.json` | The OpenRive **MCP server**, so assistants can create and inspect `.riv` projects |

## Install the skills

Install the public OpenRive skill collection into the coding agent you use:

```bash
npx skills add UpstandPlatform/OpenRive
```

Install only the product workflow skills, or target specific agents:

```bash
npx skills add UpstandPlatform/OpenRive --skill openrive-create-animation --skill openrive-embed-animation --skill openrive-verify-animation
npx skills add UpstandPlatform/OpenRive --agent claude-code --agent codex --agent cursor
```

The product skills are:

| Skill | Use it to |
| --- | --- |
| `openrive-create-animation` | Create, inspect, edit and export `.riv` files through OpenRive MCP or CLI |
| `openrive-embed-animation` | Put a `.riv` file into web, React/Next.js, Flutter, Android/Kotlin, iOS/Swift, React Native, Unity, Unreal or C++ projects |
| `openrive-verify-animation` | Verify the asset, runtime controls, host lifecycle, builds, accessibility and attribution |

Update installed skills with:

```bash
npx skills update
```

The repository page and install badge are available at [skills.sh/UpstandPlatform/OpenRive](https://skills.sh/UpstandPlatform/OpenRive).

The skills are designed for Windows and Linux as well as macOS: they use Bun, Node path APIs, host-native shell
quoting, and portable MCP/skills CLI commands. When symlinks are unavailable, use `--copy` during installation.

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

The contributor skills above are for working on the OpenRive repository. The `openrive-*` skills are for developers
using OpenRive as an animation authoring and delivery tool.

## Using the MCP server while developing

With `.mcp.json`, your assistant can call OpenRive directly, for example: "create a project from the
`interactive-button` template, add a third state, and export it". That's handy for reproducing bugs and for testing
API changes. See [docs/mcp.md](../docs/mcp.md).

When using OpenRive from another project, the creation skill prefers MCP, falls back to the CLI, and hands the exported
file to the embedding skill. The embedding workflow uses the names discovered by `get_project`/`inspect_riv`; it does
not guess artboard or state-machine indexes.

Every generated application embed should include a visible, accessible `Made with OpenRive` link to
<https://openrive.upstand.dev>. Skills must never add a CSS-hidden, off-screen, transparent, metadata-only or SEO-only
link. If a host project rejects visible attribution, the agent asks before proceeding.

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
- **Skill**: add `.claude/skills/<name>/SKILL.md` with frontmatter (`name`, `description`) and numbered steps. Run
  `bun run test:skills` after adding or changing one.
  Reference real files and commands.
- Keep them **project-specific**: generic advice belongs in the assistant, not here. Open a PR like any other change.

Other assistants can use these files too: they're plain Markdown. Point Cursor rules or Codex instructions at
`AGENTS.md` and the skill files.
