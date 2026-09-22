# Desktop app

OpenRive ships a desktop build made with [Electrobun](https://electrobun.dev): a small native window around the same
editor, with the embedded PostgreSQL database in your user data folder. No browser tab, no server to start.

## Download

Every release has installers attached, built on GitHub Actions:

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `macos-arm64-OpenRive.dmg` |
| Windows | `win-x64-OpenRive-Setup.zip` |
| Linux | `linux-x64-OpenRive-Setup.tar.gz` |

Builds for a branch or pull request are available as workflow artifacts from the **Desktop** workflow run.

## Releasing (maintainers)

Releases are made from the **Desktop** workflow — no version-bump commit needed:

1. **Actions › Desktop › Run workflow.**
2. Choose what to release: `patch` (default), `minor`, `major`, or `none` for artifacts only.
3. Optionally tick **pre-release** or **draft**, and pick the Electrobun channel.

The workflow takes the newest `v*` tag, increases it, stamps that version into `electrobun.config.ts` and the
package manifests, builds on macOS, Windows and Linux, creates the tag, and publishes a GitHub release with all
installers attached and generated release notes.

Pushing a tag by hand still works and releases exactly that version:

```bash
git tag v1.2.0 && git push origin v1.2.0
```

Version numbers therefore live in the tags; the `version` fields in the repository are only defaults for local
builds.

## How it works

- The main process (Bun, bundled) starts the Next.js standalone server on a free local port and opens a window on it.
- Projects live in the platform's user data folder (`Utils.paths.userData/data`), in the embedded database.
- Setting `DATABASE_URL` before launching points the app at a shared PostgreSQL instead, so a team can use the same
  projects from the desktop app and a self-hosted server.

## Building it yourself

```bash
bun install
bun run --cwd apps/desktop build:server     # Next.js standalone bundle
bun run build:desktop                       # hutch/electrobun build --env=stable
```

Artifacts land in `apps/desktop/artifacts/`. Electrobun does not cross-compile: build each platform on that platform.

Requirements: Bun 1.4+, plus the platform toolchain Electrobun needs (Xcode command line tools and `cmake` on macOS;
Visual Studio Build Tools and `cmake` on Windows; `build-essential cmake pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
libayatana-appindicator3-dev libpipewire-0.3-dev librsvg2-dev` on Ubuntu). The first build downloads the Electrobun
toolchain into `~/.hutch`.

To run it in development:

```bash
bun run desktop        # builds the server bundle, then electrobun dev
```

## Files

| Path | What |
| --- | --- |
| `apps/desktop/src/bun/index.ts` | Main process: starts the server, opens the window |
| `apps/desktop/src/mainview/` | Fallback view shown if the server does not start |
| `apps/desktop/electrobun.config.ts` | App name, identifier, bundle contents |
| `scripts/bundle-desktop-server.ts` | Builds and stages the standalone server |
| `.github/workflows/desktop.yml` | Per-OS builds and artifact upload |
