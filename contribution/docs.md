# Writing docs

User and operator docs live in [`docs/`](../docs/README.md). Contributor docs live here in `contribution/`. The README is
the front page: keep it short and link out.

## Principles

- **Task first.** Start with what the reader wants to do, then show the commands.
- **Copy-pasteable.** Commands should work as written. Use `<placeholders>` sparingly and explain them.
- **Current.** When behavior changes, update the page in the same PR.
- **Plain language.** Short sentences, second person ("you"), no marketing words.
- **Tables** for options and variables, **code blocks** with a language tag for commands.

## Structure

| Folder | Audience |
| --- | --- |
| `docs/running-locally.md`, `self-hosting.md`, `configuration.md`, `storage.md` | People running OpenRive |
| `docs/user-guide.md`, `shortcuts.md`, `templates.md`, `theme-colors.md`, `text-and-assets.md`, `code-panel.md`, `users.md` | People using the editor |
| `docs/cli.md`, `mcp.md`, `rest-api.md` | People automating it |
| `docs/architecture.md`, `file-format.md`, `troubleshooting.md` | Curious users and contributors |
| `contribution/` | Contributors |

New page? Link it from `docs/README.md` (and from the README if it's important).

## Screenshots

Put images in `docs/images/` as PNG or WebP, under 300 KB, with descriptive file names and alt text.

## Checking

Preview Markdown in your editor or on GitHub, click every relative link, and run the commands you documented.
