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
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
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

const updatePreferencesPath = join(Utils.paths.userData, 'update-preferences.json');
type UpdatePreferences = { skippedVersions: Record<string, string> };

function readUpdatePreferences(): UpdatePreferences {
  try {
    const raw = readFileSync(updatePreferencesPath, 'utf8');
    if (raw.length > 16_384) return { skippedVersions: {} };
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !('skippedVersions' in value)) return { skippedVersions: {} };
    const entries = (value as { skippedVersions?: unknown }).skippedVersions;
    if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) return { skippedVersions: {} };
    const skippedVersions: Record<string, string> = {};
    for (const [channel, version] of Object.entries(entries)) {
      if ((channel === 'stable' || channel === 'canary') && typeof version === 'string' && version.length <= 256) {
        skippedVersions[channel] = version;
      }
    }
    return { skippedVersions };
  } catch {
    return { skippedVersions: {} };
  }
}

const updatePreferences = readUpdatePreferences();

function persistSkippedVersion(channel: string, version: string) {
  const nextPreferences: UpdatePreferences = {
    skippedVersions: { ...updatePreferences.skippedVersions, [channel]: version },
  };
  const tempPath = `${updatePreferencesPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(nextPreferences), { encoding: 'utf8', mode: 0o600 });
    renameSync(tempPath, updatePreferencesPath);
    updatePreferences.skippedVersions = nextPreferences.skippedVersions;
  } finally {
    try { unlinkSync(tempPath); } catch { /* renamed or already removed */ }
  }
}

const updates = {
  supported: true,
  version: '0.0.0',
  channel: 'stable',
  hasChecked: false,
  checking: false,
  downloading: false,
  installing: false,
  available: false,
  skipped: false,
  ready: false,
  progress: undefined as number | undefined,
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
  if (entry.status === 'download-progress' && typeof entry.details?.progress === 'number') {
    updates.progress = Math.max(0, Math.min(100, entry.details.progress));
  } else if (entry.status === 'download-starting' || entry.status === 'downloading-patch' || entry.status === 'downloading-full-bundle') {
    updates.progress = undefined;
  }
  if (entry.status === 'error') updates.error = entry.message;
});

let updateCheckInFlight: Promise<void> | undefined;
let updateDownloadInFlight: Promise<void> | undefined;

function checkForUpdate(): Promise<void> {
  if (!updates.supported) return Promise.resolve();
  if (updateCheckInFlight) return updateCheckInFlight;
  updates.checking = true;
  updates.hasChecked = false;
  updates.error = undefined;
  updates.skipped = false;
  updates.message = 'Checking for updates…';
  let task!: Promise<void>;
  task = (async () => {
    try {
      const result = await Updater.checkForUpdate();
      updates.available = result.updateAvailable;
      updates.newVersion = result.updateAvailable ? result.version : undefined;
      updates.ready = result.updateReady;
      updates.skipped = !!result.updateAvailable && updatePreferences.skippedVersions[updates.channel] === result.version;
      updates.error = result.error || undefined;
      updates.message = result.error || (result.updateAvailable ? `Version ${result.version} is available` : 'OpenRive is up to date');
    } catch (e) {
      updates.error = (e as Error).message || 'Could not check for updates';
      updates.message = updates.error;
      updates.available = false;
      updates.newVersion = undefined;
    }
  })().finally(() => {
    updates.checking = false;
    updates.hasChecked = true;
    if (updateCheckInFlight === task) updateCheckInFlight = undefined;
  });
  updateCheckInFlight = task;
  return task;
}

function downloadUpdate(): Promise<void> {
  if (updateDownloadInFlight) return updateDownloadInFlight;
  if (!updates.supported || !updates.available || updates.installing) return Promise.resolve();
  updates.downloading = true;
  updates.error = undefined;
  updates.progress = 0;
  updates.message = 'Preparing the update…';
  let task!: Promise<void>;
  task = (async () => {
    try {
      await Updater.downloadUpdate();
      const result = Updater.updateInfo();
      updates.ready = result.updateReady;
      updates.available = result.updateAvailable;
      updates.newVersion = result.updateAvailable ? result.version : undefined;
      updates.error = result.error || undefined;
      updates.message = result.error || (result.updateReady ? 'Update downloaded and ready to install' : 'The update could not be prepared');
      if (!result.updateReady) updates.progress = undefined;
    } catch (e) {
      updates.error = (e as Error).message || 'Could not download the update';
      updates.message = updates.error;
      updates.progress = undefined;
    }
  })().finally(() => {
    updates.downloading = false;
    if (updateDownloadInFlight === task) updateDownloadInFlight = undefined;
  });
  updateDownloadInFlight = task;
  return task;
}

async function applyUpdate() {
  if (!updates.ready || updates.installing || updates.downloading) return;
  updates.installing = true;
  updates.error = undefined;
  updates.message = 'Restarting OpenRive to install the update…';
  try {
    await Updater.applyUpdate();
    const result = Updater.updateInfo();
    if (result.error) {
      updates.error = result.error;
      updates.message = result.error;
      updates.installing = false;
    } else if (updates.installing) {
      // A successful apply exits the current process. Reaching this line means
      // the runtime declined or failed to start the handoff.
      updates.error = 'OpenRive could not start the update. You can retry from the app menu.';
      updates.message = updates.error;
      updates.installing = false;
    }
  } catch (e) {
    updates.error = (e as Error).message || 'Could not start the update';
    updates.message = updates.error;
    updates.installing = false;
  }
}

function skipAvailableUpdate(version: string) {
  if (!updates.available || !updates.newVersion || version !== updates.newVersion) return false;
  persistSkippedVersion(updates.channel, version);
  updates.skipped = true;
  return true;
}

// a quiet check a few seconds after start, so the menu already knows
if (updates.supported) setTimeout(() => void checkForUpdate(), 8_000);

const control = Bun.serve({
  hostname: '127.0.0.1',
  port: controlPort,
  async fetch(request) {
    const { pathname, searchParams } = new URL(request.url);
    const origin = request.headers.get('origin');
    // The fallback page uses Electrobun's opaque views:// origin; the random
    // per-run token still gates these loopback requests.
    const allowedOrigins = new Set([url, 'null', 'views://mainview']);
    const headers = {
      'access-control-allow-origin': origin && allowedOrigins.has(origin) ? origin : url,
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      vary: 'Origin',
    };
    if (origin && !allowedOrigins.has(origin)) return new Response('origin rejected', { status: 403, headers });
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
        window.close(); void shutdown();
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
        if (request.method !== 'GET') return new Response('method not allowed', { status: 405, headers });
        return Response.json(updates, { headers });
      case '/update/check':
        if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers });
        await checkForUpdate();
        return Response.json(updates, { headers });
      case '/update/download':
        if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers });
        await downloadUpdate();
        return Response.json(updates, { headers });
      case '/update/skip': {
        if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers });
        const version = searchParams.get('version') ?? '';
        try {
          if (!skipAvailableUpdate(version)) return Response.json({ error: 'That update is no longer available.' }, { status: 409, headers });
        } catch (e) {
          updates.error = (e as Error).message || 'Could not save the skipped version';
          return Response.json({ error: updates.error }, { status: 500, headers });
        }
        return Response.json(updates, { headers });
      }
      case '/update/apply':
        if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers });
        if (!updates.ready) return Response.json({ error: 'The update has not finished downloading.' }, { status: 409, headers });
        if (updates.installing) return Response.json(updates, { headers });
        // Let Bun flush the acknowledgement before Electrobun exits this process.
        updates.installing = true;
        updates.message = 'Restarting OpenRive to install the update…';
        setTimeout(() => {
          updates.installing = false;
          void applyUpdate();
        }, 150);
        return Response.json(updates, { headers });
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
  url: ready ? appUrl : `views://mainview/index.html?controlPort=${controlPort}&controlToken=${token}`,
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

if (!ready) { void waitForServer(url, 30_000).then((isReady) => { if (isReady && !shuttingDown) window.loadURL(appUrl); }); } process.on('exit', () => { if (server && server.exitCode === null) server.kill(); }); void window;
