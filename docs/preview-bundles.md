# Preview bundles

A preview bundle is the preview screen as a folder you can ship: a `.zip` holding the `.riv` file, an `index.html`,
an `index.js` player and (by default) the Rive runtime itself. Unzip it, serve it, and you get the same picture as
OpenRive's Preview — artboard and state machine pickers, inputs, data bound properties and an event log — with no
OpenRive, no build step and no account.

Use it to hand an animation to a developer, attach it to a ticket, drop it on a static host, or check a file on a
machine that has nothing installed but a browser.

## Export one

| Where | How |
| --- | --- |
| Preview screen | **Bundle** → *With the Rive runtime* or *Runtime from CDN* |
| Editor | The OpenRive menu → **Export preview bundle**, or `Ctrl+Shift+E` (`⌘⇧E`) |
| Right-click the canvas | **Export preview bundle (.zip)** |
| CLI | `bun run cli export <project> [out.zip] --bundle [--cdn]` |
| REST | `GET /api/projects/<id>/bundle[?runtime=cdn]` |

Exporting from the editor saves the file first, because the bundle is built from the saved `.riv`.

### Two flavours

- **With the Rive runtime** (default) — the runtime `.mjs` and `.wasm` ship inside the zip, so the bundle plays with
  no network at all. About 2 MB plus your file.
- **Runtime from CDN** — `index.js` imports `@rive-app/canvas-advanced` from unpkg. A few KB plus your file, but it
  needs internet when it runs.

Offline bundles ship whichever runtime the editor is currently rendering with, including a build from
[the SDK submodules](rive-sdk.md).

## Run one

Browsers refuse to load modules and fetch files from `file://` URLs, so serve the folder:

```bash
npx --yes serve .
```

`python3 -m http.server 8000` works just as well. Then open the printed URL.

## What is inside

| File | Purpose |
| --- | --- |
| `index.html` | The preview page |
| `index.js` | The player: `mountPreview()`, `createPlayer()`, and a `manifest` of the file's scenes |
| `styles.css` | Styling for the preview UI |
| `<name>.riv` | Your animation, byte for byte the same as **Export .riv** |
| `runtime/` | The Rive runtime (offline bundles only) |
| `README.md`, `package.json` | How to run it, and a name for it |

## Embed it in a page

The bundle is also a small library. `createPlayer()` gives you the canvas player without the surrounding UI:

```html
<canvas id="rive" style="width: 480px; height: 360px"></canvas>
<script type="module">
  import { createPlayer } from './index.js';

  const player = await createPlayer({
    canvas: document.getElementById('rive'),
    artboard: 'Interactive Button', // index or name; defaults to the first
    stateMachine: 0, // -1 to play a timeline instead
    onEvent: (name) => console.log('Rive event', name),
  });

  player.setInput('isHover', true); // state machine inputs
  player.setProperty('Label', 'string', 'Buy now'); // data bound properties
  player.pause();
  player.dispose();
</script>
```

`mountPreview(element)` builds the full preview UI instead, and `manifest` lists every artboard, timeline, state
machine and input so you can drive the file without opening it.

For snippets that use the regular Rive runtimes in a real app (React, Flutter, iOS, Android…), use the editor's
[Code panel](code-panel.md).

## How it is built

[`packages/rive/src/bundle.ts`](../packages/rive/src/bundle.ts) generates the files and packs them with a small
built-in zip writer (stored entries, no dependency), so the web app, the CLI and any other tool build byte-identical
bundles. `bun run test` checks the zip unpacks, that every entry's CRC matches and that the `.riv` inside still
round-trips.
