// OpenRive desktop (Electrobun).
//
// The main process starts the bundled Next.js standalone server on a free
// local port, then opens a window on it. Projects are stored in the user's
// application data folder (embedded PostgreSQL), or in DATABASE_URL when set.
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

const window = new BrowserWindow({
  title: 'OpenRive',
  url: ready ? url : `views://mainview/index.html`,
  frame: { width: 1440, height: 900, x: 60, y: 60 },
});

const shutdown = () => {
  server.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => server.kill());

void window;
