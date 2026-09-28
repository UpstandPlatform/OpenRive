// OpenRive desktop (Electrobun).
//
// The main process starts the bundled Next.js standalone server on a free local
// port, then opens a frameless window on it. The title bar is drawn by the web
// app (see DesktopChrome) and talks back through the small control server
// below, because the page is served over http rather than from views://.
//
// Projects live in the user's application data folder (embedded PostgreSQL), or
// in DATABASE_URL when one is set.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, PATHS, Utils } from 'electrobun/main';

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

const port = await freePort();
const url = `http://127.0.0.1:${port}`;

if (!existsSync(entry)) throw new Error(`Bundled server not found at ${entry}. Build the web app before packaging.`);

const server = Bun.spawn([process.execPath, entry], {
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

const ready = await waitForServer(url);

// ---------------------------------------------------------------------------
// Window controls for the web-drawn title bar.
//
// Dragging needs nothing: Electrobun's preload handles the app-region CSS. The
// buttons do need to reach the native window, so the main process listens on
// 127.0.0.1 and only answers requests carrying this run's token.

const token = crypto.randomUUID();
const controlPort = await freePort();

const control = Bun.serve({
  hostname: '127.0.0.1',
  port: controlPort,
  async fetch(request) {
    const { pathname, searchParams } = new URL(request.url);
    const headers = { 'access-control-allow-origin': url, 'access-control-allow-headers': 'content-type' };
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

const shutdown = () => {
  server.kill();
  void control.stop(true);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => server.kill());

void window;
