# The Rive SDK submodules

OpenRive renders with Rive's own runtime. By default that is the published npm package
`@rive-app/canvas-advanced`; the WASM and its loader are copied into `apps/web/public/rive` on install so the editor
works offline.

Two forks of Rive's repositories are vendored as git submodules so the SDK itself can be read, patched and rebuilt:

| Submodule | Fork | Upstream | What it is |
| --- | --- | --- | --- |
| `vendor/rive-wasm` | [UpstandPlatform/rive-wasm](https://github.com/UpstandPlatform/rive-wasm) | [rive-app/rive-wasm](https://github.com/rive-app/rive-wasm) | The JS/WASM SDK that builds `@rive-app/canvas-advanced` — the runtime the editor renders with |
| `vendor/rive-runtime` | [UpstandPlatform/rive-runtime](https://github.com/UpstandPlatform/rive-runtime) | [rive-app/rive-runtime](https://github.com/rive-app/rive-runtime) | The low level C++ runtime and renderer that `rive-wasm` compiles |

Both are MIT licensed, as is the fork of each.

## Commands

| Command | What it does |
| --- | --- |
| `bun run rive:status` | Shows what is checked out, what is built, and which runtime the editor uses |
| `bun run rive:init` | Clones/updates the submodules and adds the `upstream` remotes |
| `bun run rive:update` | Fast-forwards each fork onto rive-app's latest, then tells you what to push |
| `bun run rive:build` | Builds the WASM runtime from `vendor/rive-wasm` |
| `bun run rive:sync` | Makes the editor render with that build |
| `bun run rive:npm` | Goes back to the published npm runtime |

They all live in [`scripts/rive-sdk.ts`](../scripts/rive-sdk.ts).

## Getting the submodules

A fresh clone does not fetch them. Either clone with them:

```bash
git clone --recurse-submodules https://github.com/UpstandPlatform/OpenRive
```

or add them afterwards:

```bash
bun run rive:init
```

Nothing else in OpenRive needs them: without the submodules the editor still renders with the npm runtime.

## Updating the SDK

```bash
bun run rive:update        # fetch rive-app and fast-forward each fork
git -C vendor/rive-wasm push origin master
git -C vendor/rive-runtime push origin main
git add vendor && git commit -m "chore: update Rive SDK submodules"
```

`rive:update` never pushes for you, and stops at a fork that has diverged (because you committed your own changes to
it) so you can merge by hand.

The commit each submodule points at is part of this repository's history, so everyone who runs `rive:init` gets the
same SDK.

## Rendering with your own build

Building the WASM runtime needs Emscripten and `rive-wasm`'s own submodules:

```bash
git -C vendor/rive-wasm submodule update --init --recursive
bun run rive:build         # runs vendor/rive-wasm/js/build.sh
bun run rive:sync          # copies the build into apps/web/public/rive/local
```

`rive:sync` writes `apps/web/public/rive/runtime.json` with `"source": "submodule"`. From then on:

- [`apps/web/src/lib/runtime.ts`](../apps/web/src/lib/runtime.ts) loads `/rive/local/canvas_advanced.mjs` instead of the
  npm package, so the stage, the preview and the player all use your build,
- offline [preview bundles](preview-bundles.md) ship your build too,
- `bun install` leaves it alone (`scripts/copy-wasm.ts` refuses to overwrite it).

Restart the dev server after syncing. `bun run rive:npm` deletes the local build and restores the npm runtime.

Everything under `apps/web/public/rive/local/` and `runtime.json` is git-ignored: a custom runtime stays on the machine
that built it, and what ships is the submodule commit plus the build instructions.

## Where the pieces are

| Path | Role |
| --- | --- |
| `vendor/rive-wasm`, `vendor/rive-runtime` | The forked SDKs (git submodules) |
| `scripts/rive-sdk.ts` | The `rive:*` commands |
| `scripts/copy-wasm.ts` | Copies the npm runtime into `public/rive` on install |
| `apps/web/public/rive/runtime.json` | Which build is active |
| `apps/web/src/lib/runtime.ts` | Loads the active build in the browser |
| `apps/web/src/lib/server/riveRuntime.ts` | Finds the active build for preview bundles |
