# CLI: `openrive`

The CLI works directly on OpenRive's storage (files or PostgreSQL), so the web app doesn't need to be running. An
open editor tab picks up changes within a couple of seconds.

## Running it

```bash
npm run cli -- <command>          # from the repo
npm link                          # once, then:
openrive <command>
```

In Docker: `docker compose exec openrive openrive <command>`.

## Commands

### Server

| Command | Description |
| --- | --- |
| `serve [--port 3000] [--host 0.0.0.0] [--dev]` | Start the editor (production build unless `--dev`) |
| `mcp` | Start the [MCP server](mcp.md) on stdio |

### Projects

| Command | Description |
| --- | --- |
| `list` | List projects (id, name, owner, updated) |
| `new <name> [--template <id>]` | Create a project from a template or example (`templates` lists ids) |
| `templates` | List templates and example files |
| `import <file.riv…> [--name <name>]` | Import `.riv` files as projects |
| `export <project> [out.riv]` | Write a project's `.riv` |
| `info <project \| file.riv> [--json]` | Show artboards, objects, timelines, state machines and theme colors |
| `delete <project>` | Delete a project |
| `validate <file.riv…>` | Check files round-trip losslessly through OpenRive |

Projects can be referenced by id or name.

### Users

| Command | Description |
| --- | --- |
| `users` | List users |
| `users add <name> [--role admin\|editor\|viewer]` | Add a user |
| `users remove <name\|id>` | Remove a user (their files move to an admin) |

### Storage

| Command | Description |
| --- | --- |
| `storage` | Show the active backend, its location and counts |
| `migrate --from <dir\|postgres://…> --to <dir\|postgres://…>` | Copy all users and projects between stores |

### Global options

| Option | Description |
| --- | --- |
| `--data <dir>` | Use this data folder (like `OPENRIVE_DATA_DIR`) |
| `--db <url>` | Use PostgreSQL (like `DATABASE_URL`) |
| `--help` | Help |

## Examples

```bash
openrive new "Onboarding" --template interactive-button
openrive info "Onboarding"
openrive export "Onboarding" ./onboarding.riv
openrive import ~/Downloads/*.riv
openrive validate ./assets/*.riv                     # CI check that files are intact
openrive info some.riv --json | jq '.artboards[0].stateMachines'
openrive --db postgres://localhost/openrive list
```
