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

## The GitHub wiki

The [wiki](https://github.com/UpstandPlatform/OpenRive/wiki) is **generated** from this repository. Don't edit it on
GitHub, because the next publish overwrites your changes.

| Source | Becomes |
| --- | --- |
| `docs/*.md`, `contribution/*.md`, `CONTRIBUTING.md` | Wiki pages (the mapping is in `PAGES` in `scripts/build-wiki.mjs`) |
| `wiki/*.md` | Wiki-only pages: `Home`, `_Sidebar`, `_Footer`, `Getting-Started`, tutorials, `FAQ`, `Glossary`, `Roadmap` |

Links between docs become wiki links, links to other repo files become GitHub URLs, and each generated page gets a
"Suggest an edit" footer that points at its source.

```bash
bun run wiki            # builds into .wiki/ and fails on broken wiki links
```

The **Wiki** workflow (`.github/workflows/wiki.yml`) checks links on pull requests and publishes on every push to
`main`. When you add a docs page, add it to `PAGES` and to `wiki/_Sidebar.md`.

To publish by hand, clone the wiki repo and copy the build output into it:

```bash
bun run wiki
git clone https://github.com/UpstandPlatform/OpenRive.wiki.git ../OpenRive.wiki
cp -r .wiki/. ../OpenRive.wiki/
cd ../OpenRive.wiki && git add -A && git commit -m "Update wiki" && git push
```
