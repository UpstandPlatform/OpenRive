# CLI: `openrive`

`openrive` runs on Bun and talks to the database directly, so the web app does not need to be running. An open editor
tab picks up changes within a couple of seconds.

## Running it

```bash
bun run cli <command>             # from the repository
bun link                          # once, then:
openrive <command>
```

In Docker: `docker compose exec openrive openrive <command>`.

## Interactive mode

Running `openrive` with no command opens a terminal UI (built with [OpenTUI](https://opentui.com)):

```
OpenRive 18 projects
  ▸ Welcome to OpenRive     1 artboards · 6 timelines · 1 state machines · 22/09/2026, 19:02
    CyFit-Robot             1 artboards · 26 timelines · 1 state machines · …
↑↓ select · n new · e export · o editor url · d delete · u users · r refresh · q quit
```

| Key | Does |
| --- | --- |
| `↑` `↓` | Move through projects |
| `n` | New project — pick a template or example from a list |
| `e` | Export the selected project to a `.riv` in the current folder |
| `o` | Show the editor URL for the selected project |
| `d` | Delete the selected project (asks first) |
| `u` | Show users |
| `r` | Refresh |
| `q` / `Ctrl C` | Quit |

Scripts and pipes still get plain commands: with no TTY, `openrive` prints its help instead of opening the UI.

## Commands

### Server

| Command | Description |
| --- | --- |
| `serve [--port 3000] [--host 0.0.0.0] [--dev]` | Start the editor |
| `mcp` | Start the [MCP server](mcp.md) on stdio |

### Projects

| Command | Description |
| --- | --- |
| `list` | List projects (id, name, owner, updated) |
| `new <name> [--template <id>]` | Create a project from a template or example (`templates` lists ids) |
| `templates` | List templates and example files |
| `import <file.riv…> [--name <name>]` | Import `.riv` files as projects |
| `export <project> [out.riv]` | Write a project's `.riv` |
| `export <project> [out.zip] --bundle [--cdn]` | Write a standalone [preview bundle](preview-bundles.md): `index.html`, `index.js`, the `.riv` and (without `--cdn`) the Rive runtime |
| `info <project \| file.riv\|file.oriv\|source-folder> [--json]` | Show artboards, objects, timelines, state machines and theme colors |
| `delete <project>` | Delete a project |
| `validate <file.riv\|file.oriv\|source-folder…>` | Check files round-trip losslessly and validate editable sources |
| `diagnose <file.riv\|file.oriv\|source-folder…> [--json]` | Explain missing assets, unknown objects, uneditable features and compatibility risks |
| `source export <project\|file.riv> [out.oriv\|folder]` | Export a portable `.oriv` backup or a Git-friendly source folder |
| `source import <file.oriv\|folder> [name]` | Import an editable source archive or folder as a project |
| `render <project\|file.riv\|file.oriv\|source-folder> [out.png] [options]` | Render a still frame locally with the Rive runtime |

Projects can be referenced by id or name.

### Users

| Command | Description |
| --- | --- |
| `users` | List users |
| `users add <name> [--role …] [--password <pw>] [--email <e>]` | Add a user, optionally with a password |
| `users password <name\|id> [--password <pw>]` | Set a password (asks for it when not given) — how you recover a locked-out server |
| `users role <name\|id> --role admin\|editor\|viewer` | Change a role |
| `users remove <name\|id>` | Remove a user (their files move to an admin) |

### Database

| Command | Description |
| --- | --- |
| `db status` | Show the database in use and what it holds |
| `db import [dir]` | Import a legacy data folder (the pre-Drizzle file storage) |
| `db auth` | Whether sign-in is required, and which accounts can sign in |

### Global options

| Option | Description |
| --- | --- |
| `--db <url>` | PostgreSQL URL (same as `DATABASE_URL`) |
| `--data <dir>` | Data folder for the embedded database (default: `./data`) |
| `--help` | Help |

## Examples

```bash
openrive new "Onboarding" --template interactive-button
openrive info "Onboarding"
openrive export "Onboarding" ./onboarding.riv
openrive export "Onboarding" --bundle                # a zip that plays the animation anywhere
openrive import ~/Downloads/*.riv
openrive validate ./assets/*.riv                     # CI check that files are intact
openrive diagnose ./assets/character.riv --json      # machine-readable file health report
openrive source export "Onboarding" ./onboarding-src # manifest + separately stored assets
openrive source export ./onboarding.riv ./backup.oriv
openrive source import ./backup.oriv "Onboarding copy"
openrive render ./onboarding.riv ./frame.png --animation 0 --time 0.5 --scale 2
openrive info some.riv --json | jq '.artboards[0].stateMachines'
openrive --db postgres://localhost/openrive list
```

> With the embedded database, stop the web app first (one process at a time), or give the CLI its own `--data` folder.

See [Git-friendly sources and backups](source-format.md) for the folder layout, safety limits and CI examples.
