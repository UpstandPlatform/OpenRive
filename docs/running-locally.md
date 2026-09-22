# Running OpenRive locally

OpenRive runs on your computer as a small Next.js web app. Nothing is sent anywhere, and there is no login.

## Requirements

- **Node.js 20.9 or newer** (22 LTS recommended), which includes npm
- Any modern browser (Chrome, Edge, Firefox, Safari)
- Windows, macOS or Linux

Check your version with `node -v`.

## 1. Get the code

```bash
git clone https://github.com/<your-org>/openrive.git
cd openrive
```

Or download the ZIP from GitHub and extract it.

## 2. Install

```bash
npm install
```

`postinstall` copies the Rive WASM runtime into `public/rive/`, so the editor works offline.

## 3. Run

### Development mode (hot reload, for hacking on OpenRive)

```bash
npm run dev
```

### Production mode (faster, for everyday use)

```bash
npm run build
npm start                 # or: npm run cli -- serve
```

Open **http://localhost:3000**.

On first start, OpenRive creates:

- a user called **Admin**, which you can rename on the Users page
- a **Welcome to OpenRive** project with the interactive logo

## Where your files are stored

By default everything is stored in `./data`:

```
data/
  users.json
  projects/<id>/meta.json   name, owner, stats, thumbnail
  projects/<id>/doc.json    editor document (includes theme colors and scripts)
  projects/<id>/file.riv    the exported Rive file
```

Back it up by copying the folder. To keep your data elsewhere:

```bash
OPENRIVE_DATA_DIR=~/Documents/OpenRive npm start
```

To use PostgreSQL even locally, set `DATABASE_URL` (see [Storage](storage.md)).

## Change the port or allow other devices

```bash
npm run cli -- serve --port 4000                 # another port
npm run cli -- serve --host 0.0.0.0              # reachable from your network
```

> If other people can reach the server, set `OPENRIVE_ACCESS_TOKEN`, because the app has no login. See
> [Self-hosting](self-hosting.md#protecting-access).

## Install the CLI globally (optional)

```bash
npm link
openrive --help
```

See [CLI](cli.md).

## Update

```bash
git pull
npm install
npm run build
```

Your `data/` folder is not touched by updates.

## Next steps

- [User guide](user-guide.md)
- [Keyboard shortcuts](shortcuts.md)
- [Connect an AI assistant with MCP](mcp.md)
