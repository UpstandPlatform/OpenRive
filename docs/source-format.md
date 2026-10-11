# Git-friendly editable sources

OpenRive projects can be saved as a reviewable directory or a portable `.oriv` archive. Both formats preserve the
editable document and embedded asset bytes; `.riv` remains the runtime format that applications load.

## Source directory

The directory contains `openrive.json` and an `assets/` folder. The JSON manifest stores editor objects and metadata;
each embedded asset is kept in its own binary file so changes to one image or font do not replace a large opaque
archive. Keep the directory in Git alongside your application code.

```sh
openrive source export ./character.riv ./character-source
openrive validate ./character-source
openrive diagnose ./character-source --json
openrive source import ./character-source "Character"
```

You can also export a project by name or id. Folder imports reject symbolic links and unsafe paths.

## Portable archive

Use `.oriv` for a single-file editable backup or for transferring a project between OpenRive editions. The archive is
a ZIP containing the same manifest and separate asset entries.

```sh
openrive source export "Character" ./character.oriv
openrive source import ./character.oriv "Character copy"
```

The web Files page accepts `.riv` and `.oriv`; the editor's Export menu can save an `.oriv` backup. Local,
self-hosted and cloud editions use the same source parser and document editing API.

## CI checks and rendering

Validate committed runtime files and editable source folders before publishing:

```sh
openrive validate ./assets/*.riv ./character-source
openrive diagnose ./assets/*.riv --json
openrive render ./character-source ./preview.png --artboard Main --animation Idle --time 0.5
```

`validate` confirms a `.riv` round-trips byte-for-byte and checks the manifest and assets in editable sources.
`diagnose` reports malformed references, missing asset data, preserved unknown objects or properties, and features
that OpenRive can preserve and play but cannot fully edit. `render` uses the local official Rive runtime and does not
upload the file. GIF and PNG sprite-sheet exports are available from the editor's **Export GIF or sprite sheet**
dialog; both render locally in the browser.

Vector stills use the built-in software pipeline. Embedded images and image meshes automatically use local Chromium;
install it once with `bunx playwright-core@1.64.0 install chromium`. Use `--renderer browser` to select that pipeline
explicitly, or `--browser /path/to/chromium` to use an existing executable. Linux CI can use
`bunx playwright-core@1.64.0 install --with-deps chromium`. External assets must be embedded before local rendering.
The browser pipeline serves only the file and bundled runtime on loopback and blocks remote requests.

Source archives are limited to 128 MB compressed, 512 MB unpacked and 10,000 entries. These bounds protect imports
from unexpectedly large or pathological archives.
