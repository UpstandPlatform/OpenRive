# Troubleshooting

### The canvas is blank or shows "Failed to load the Rive runtime"

The WASM runtime is copied to `apps/web/public/rive/rive.wasm` on `bun install`. Run `bun scripts/copy-wasm.ts` (or
`bun install` again) and reload. Behind a proxy, make sure `/rive/rive.wasm` is served with
`Content-Type: application/wasm`.

### A preview bundle shows nothing, or "Could not read …riv"

Browsers block module imports and `fetch` on `file://` URLs, so opening `index.html` by double-clicking it cannot
work. Serve the unzipped folder instead: `npx --yes serve .` (or `python3 -m http.server 8000`), then open the
printed URL. A bundle exported with *Runtime from CDN* also needs internet — re-export it with the runtime included
to play offline. See [preview bundles](preview-bundles.md).

### The console says state machine inputs are deprecated

Rive deprecated inputs in favour of data binding properties, and warns when runtime code calls
`stateMachineInputs`. Open the file in OpenRive and run **Convert inputs to data binding** (the Data tab,
or right-click the canvas), then copy the new snippet from the [Code panel](code-panel.md) — it sets
properties on `rive.viewModelInstance` and no longer warns. Details in [data binding](data-binding.md).

### `bun install` fails

Use Bun 1.4+ (`bun --version`). On Windows, run the terminal as a normal user in a folder you own, not in
`C:\Program Files`.

### Port 3000 is already in use

`bun run cli serve --port 4000`, or set `PORT=4000`. With Docker Compose, set `OPENRIVE_PORT=4000` in `.env`.

### The browser keeps asking for a password

`OPENRIVE_ACCESS_TOKEN` is set. Enter any user name and the token as the password. To disable it, unset the variable
and restart.

### "Could not open the database"

- **Embedded mode**: only one process may use a data folder at a time. Stop the web app before running the CLI against
  it, or pass `--data` / `--db` to the CLI.
- Check `DATABASE_URL` (`postgres://user:password@host:5432/db`). Special characters in the password must be
  URL-encoded.
- Managed databases usually need TLS: add `?sslmode=require` or `OPENRIVE_DB_SSL=true`.
- With Docker Compose, the app waits for the `db` health check. Look at `docker compose logs db`.
- `openrive storage` shows what the CLI connects to.

### My projects disappeared after an upgrade

Older versions stored projects as files in `data/projects/`. They are imported automatically into an empty database;
run it by hand with `openrive db import`. Nothing is deleted, so the folder is still there.

### The desktop app opens "OpenRive could not start"

The bundled server did not answer in time. Run the app from a terminal to see its output, and make sure no other
process is using the same data folder.

### Keyboard shortcuts don't work

Click the canvas first: shortcuts are ignored while typing in a text field. If a shortcut was rebound, open `?` and
choose **Reset** on it. Some browser shortcuts (like `Ctrl W`) can't be overridden.

### An imported file looks different from rive.app

Report it with the file attached (see the bug template). Features OpenRive can't edit yet are preserved and should
render identically, because the same runtime draws them. `openrive validate file.riv` tells you whether the file
round-trips.

### A `.rev` file won't open

`.rev` is Rive's private editor format. Export a `.riv` from rive.app (File › Export › For runtime) and import that.

### The Rive SDK submodules are empty

`vendor/rive-wasm` and `vendor/rive-runtime` are git submodules, so a plain `git clone` leaves them empty. Run
`bun run rive:init`. Nothing else needs them — the editor renders with the npm runtime either way. See
[Rive SDK submodules](rive-sdk.md).

### Docker Desktop: "cannot connect to the Docker daemon"

Start Docker Desktop and wait until it says "Engine running", then retry `docker compose up -d`.

### Resetting everything (local)

Stop the app and delete (or move) the `data/` folder — that includes `data/pgdata`, the embedded database. The next
start creates a fresh Admin and the welcome project.
