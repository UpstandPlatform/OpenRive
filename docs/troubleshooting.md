# Troubleshooting

### The canvas is blank or shows "Failed to load the Rive runtime"

The WASM runtime is copied to `public/rive/rive.wasm` on `npm install`. Run `node scripts/copy-wasm.js` (or
`npm install` again) and reload. Behind a proxy, make sure `/rive/rive.wasm` is served with
`Content-Type: application/wasm`.

### `npm install` fails

Use Node 20.9+ (`node -v`). On Windows, run the terminal as a normal user in a folder you own, not in `C:\Program Files`.

### Port 3000 is already in use

`npm run cli -- serve --port 4000`, or set `PORT=4000`. With Docker Compose, set `OPENRIVE_PORT=4000` in `.env`.

### The browser keeps asking for a password

`OPENRIVE_ACCESS_TOKEN` is set. Enter any user name and the token as the password. To disable it, unset the variable
and restart.

### "Could not connect to PostgreSQL"

- Check `DATABASE_URL` (`postgres://user:password@host:5432/db`). Special characters in the password must be
  URL-encoded.
- Managed databases usually need TLS: add `?sslmode=require` or `OPENRIVE_DB_SSL=true`.
- With Docker Compose, the app waits for the `db` health check. Look at `docker compose logs db`.
- `openrive storage` shows what the CLI connects to.

### My projects disappeared after switching to PostgreSQL

They're still in `./data`. Copy them over: `openrive migrate --from ./data --to $DATABASE_URL`.

### Keyboard shortcuts don't work

Click the canvas first: shortcuts are ignored while typing in a text field. If a shortcut was rebound, open `?` and
choose **Reset** on it. Some browser shortcuts (like `Ctrl W`) can't be overridden.

### An imported file looks different from rive.app

Report it with the file attached (see the bug template). Features OpenRive can't edit yet are preserved and should
render identically, because the same runtime draws them. `openrive validate file.riv` tells you whether the file
round-trips.

### A `.rev` file won't open

`.rev` is Rive's private editor format. Export a `.riv` from rive.app (File › Export › For runtime) and import that.

### Docker Desktop: "cannot connect to the Docker daemon"

Start Docker Desktop and wait until it says "Engine running", then retry `docker compose up -d`.

### Resetting everything (local)

Stop the app and delete (or move) the `data/` folder. The next start creates a fresh Admin and the welcome project.
