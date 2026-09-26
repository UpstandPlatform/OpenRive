# OpenRive documentation

OpenRive is an open-source, local-first editor for Rive `.riv` files. These docs cover running it, using it, automating
it and working on it.

## Get started

| Guide | For |
| --- | --- |
| [Running locally](running-locally.md) | Run OpenRive on your own computer with Bun |
| [Self-hosting](self-hosting.md) | Run it for a team with Docker / Docker Desktop, PostgreSQL, a reverse proxy and backups |
| [Desktop app](desktop.md) | Install or build the macOS / Windows / Linux app |
| [Configuration](configuration.md) | Every environment variable |
| [Storage & PostgreSQL](storage.md) | Embedded vs. server PostgreSQL, Drizzle migrations, backups |

## Use the editor

| Guide | For |
| --- | --- |
| [User guide](user-guide.md) | Tour of the Files page, the editor, animation, state machines and preview |
| [Keyboard shortcuts](shortcuts.md) | All default shortcuts and how to rebind them |
| [Templates](templates.md) | The starter templates and example files |
| [Theme colors](theme-colors.md) | Color variables and switchable themes |
| [Text & assets](text-and-assets.md) | Text objects, fonts, images and SVG import |
| [Code panel](code-panel.md) | Automation scripts, embed snippets, and a note on Rive scripting |
| [Preview bundles](preview-bundles.md) | Export the preview as a standalone folder that plays anywhere |
| [Users & roles](users.md) | Local users, roles and sharing (no login) |

## Automate

| Guide | For |
| --- | --- |
| [CLI & terminal UI](cli.md) | The `openrive` command and its OpenTUI interface |
| [MCP server](mcp.md) | Let AI assistants (Claude, Cursor, …) build animations |
| [REST API](rest-api.md) | The HTTP API used by the web app |

## Internals

| Guide | For |
| --- | --- |
| [Architecture](architecture.md) | How the code is organized |
| [The .riv format](file-format.md) | How OpenRive reads and writes Rive files |
| [Rive SDK submodules](rive-sdk.md) | The forked Rive runtimes in `vendor/`, and rendering with your own build |
| [Troubleshooting](troubleshooting.md) | Common problems and fixes |

Want to help? See [CONTRIBUTING.md](../CONTRIBUTING.md) and the [contribution guides](../contribution/README.md).
