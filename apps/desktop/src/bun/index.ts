// OpenRive desktop (Electrobun).
//
// The main process starts the bundled Next.js standalone server on a free local
// port, then opens a frameless window on it. The window has no native chrome:
// the app's own top bars are the window handle (see apps/web/src/components/
// desktop.tsx) and they talk back through the small control server below,
// because the page is served over http rather than from views://.
//
// Projects live in the user's application data folder (embedded PostgreSQL), or
// in DATABASE_URL when one is set.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, PATHS, Updater, Utils } from 'electrobun/main';

const dataDir = join(Utils.paths.userData, 'data');
mkdirSync(dataDir, { recursive: true });

const serverDir = join(PATHS.RESOURCES_FOLDER, 'app', 'server');
const entry = join(serverDir, 'server.js');

async function freePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response('') });
  const { port } = server;
  await server.stop(true);
  return port;
}

async function waitForServer(url: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(150);
  }
  return false;
}

if (!existsSync(entry)) throw new Error(`Bundled server not found at ${entry}. Build the web app before packaging.`);

let port = 0;
let url = '';
let server: ReturnType<typeof Bun.spawn> | undefined;
let ready = false;
for (let attempt = 0; attempt < 5; attempt++) {
  port = await freePort();
  url = `http://127.0.0.1:${port}`;
  server = Bun.spawn([process.execPath, entry], {
    cwd: serverDir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      OPENRIVE_DATA_DIR: dataDir,
      OPENRIVE_URL: url,
    },
  });
  ready = await waitForServer(url, 5000);
  if (ready || server.exitCode !== null) {
    if (ready) break;
    await server.exited;
    server = undefined;
    continue;
  }
  // Keep the offline screen available for a slow start, but retain this child
  // so shutdown can clean it up in the normal lifecycle handler.
  break;
}
if (!server) throw new Error('The OpenRive server could not bind a local port after five attempts.');

// ---------------------------------------------------------------------------
// Window controls for the web-drawn title bar.
//
// Dragging needs nothing: Electrobun's preload handles the app-region CSS. The
// buttons do need to reach the native window, so the main process listens on
// 127.0.0.1 and only answers requests carrying this run's token.

const token = crypto.randomUUID();
const controlPort = await freePort();

// ---------------------------------------------------------------------------
// Updates, from the GitHub releases of the project (release.baseUrl in
// electrobun.config.ts points at the latest release's assets).

const updates = {
  supported: true,
  version: '0.0.0',
  channel: 'stable',
  checking: false,
  downloading: false,
  available: false,
  ready: false,
  newVersion: undefined as string | undefined,
  message: undefined as string | undefined,
  error: undefined as string | undefined,
};

const local = await Updater.getLocalInfo();
updates.version = local.version || updates.version;
updates.channel = local.channel;
// Only a packaged stable or canary build can update itself: a dev build and a
// run without version.json have nothing to compare against or download from.
updates.supported = (local.channel === 'stable' || local.channel === 'canary') && !!local.baseUrl;

Updater.onStatusChange((entry) => {
  updates.message = entry.message;
});

async function checkForUpdate() {
  if (!updates.supported || updates.checking) return;
  updates.checking = true;
  updates.error = undefined;
  updates.message = 'Checking for updates…';
  try {
    const result = await Updater.checkForUpdate();
    updates.available = result.updateAvailable;
    updates.newVersion = result.version;
    updates.ready = Updater.updateInfo().updateReady;
    updates.message = result.updateAvailable ? `Version ${result.version} is available` : 'OpenRive is up to date';
  } catch (e) {
    updates.error = (e as Error).message;
  } finally {
    updates.checking = false;
  }
}

async function downloadUpdate() {
  if (!updates.available || updates.downloading) return;
  updates.downloading = true;
  updates.error = undefined;
  try {
    await Updater.downloadUpdate();
    updates.ready = Updater.updateInfo().updateReady;
    updates.message = updates.ready ? 'Ready to install' : 'The download did not finish';
  } catch (e) {
    updates.error = (e as Error).message;
  } finally {
    updates.downloading = false;
  }
}

// a quiet check a few seconds after start, so the menu already knows
if (updates.supported) setTimeout(() => void checkForUpdate(), 8_000);

const control = Bun.serve({
  hostname: '127.0.0.1',
  port: controlPort,
  async fetch(request) {
    const { pathname, searchParams } = new URL(request.url);
    const headers = { 'access-control-allow-origin': url, 'access-control-allow-headers': 'content-type' };
    const origin = request.headers.get('origin');
    if (origin && origin !== url) return new Response('origin rejected', { status: 403, headers });
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (searchParams.get('token') !== token) return new Response('no', { status: 403, headers });

    switch (pathname) {
      case '/minimize':
        window.minimize();
        break;
      case '/maximize':
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        break;
      case '/close':
        window.close();
        break;
      case '/open': {
        // links to the repository, the docs and the site open in the real browser
        const target = searchParams.get('url') ?? '';
        if (/^https:\/\//.test(target)) Utils.openExternal(target);
        break;
      }
      case '/state':
        return Response.json({ maximized: window.isMaximized() }, { headers });
      case '/update/state':
        return Response.json(updates, { headers });
      case '/update/check':
        await checkForUpdate();
        return Response.json(updates, { headers });
      case '/update/download':
        await downloadUpdate();
        return Response.json(updates, { headers });
      case '/update/apply':
        // quits, swaps the app in place and starts the new version
        void Updater.applyUpdate();
        return Response.json({ ok: true }, { headers });
      default:
        return new Response('not found', { status: 404, headers });
    }
    return Response.json({ ok: true, maximized: window.isMaximized() }, { headers });
  },
});

// the page reads these and draws its own title bar
const appUrl = `${url}/?desktop=1&controlPort=${controlPort}&controlToken=${token}`;

const window = new BrowserWindow({
  title: 'OpenRive',
  url: ready ? appUrl : 'views://mainview/index.html',
  frame: { width: 1440, height: 900, x: 60, y: 60 },
  // no native chrome: the app draws the title bar and window buttons
  titleBarStyle: 'hidden',
});

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await control.stop(true);
  server!.kill('SIGTERM');
  const forceKill = setTimeout(() => server!.kill('SIGKILL'), 4000);
  await server!.exited;
  clearTimeout(forceKill);
  process.exit(0);
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

void window;
