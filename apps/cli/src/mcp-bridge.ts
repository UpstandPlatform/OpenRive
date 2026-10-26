// Stdio MCP that forwards to a running OpenRive server's /api/mcp, so an
// agent and the editor share one process (and one embedded database). Starts
// `openrive serve` on loopback first when nothing answers, and stops it again
// when the agent disconnects.
//
//   bun apps/cli/src/mcp-bridge.ts [http://127.0.0.1:5175]
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const base = new URL(process.argv[2] ?? process.env.OPENRIVE_URL ?? 'http://127.0.0.1:5175');
const log = (message: string): void => void process.stderr.write(`[openrive-bridge] ${message}\n`);

async function healthy(): Promise<boolean> {
  try {
    const res = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

let server: ChildProcess | null = null;
if (!(await healthy())) {
  if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error(`No OpenRive server at ${base.origin}`);
  log(`starting openrive serve on ${base.host}`);
  // own process group, so stopping it also stops the next-server it starts
  server = spawn('bun', [path.join(import.meta.dir, 'index.ts'), 'serve', '--host', base.hostname, '--port', base.port || '80'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, OPENRIVE_URL: base.origin },
    detached: true,
  });
  const deadline = Date.now() + 60_000;
  while (!(await healthy())) {
    if (server.exitCode !== null || server.signalCode !== null || Date.now() > deadline) throw new Error('openrive serve did not start; see the log above');
    await Bun.sleep(300);
  }
}

// One request at a time, in order: the session id arrives with the
// initialize response, and every later message must carry it.
let queue = Promise.resolve();
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await queue.catch(() => {}); // let answers to the last requests go out
  if (server?.pid && server.exitCode === null) {
    const exited = new Promise((resolve) => server!.once('exit', resolve));
    process.kill(-server.pid, 'SIGTERM');
    await Promise.race([exited, Bun.sleep(5000)]);
  }
  process.exit(0);
};

const upstream = new StreamableHTTPClientTransport(new URL('/api/mcp', base), {
  // the route checks Origin like a browser request would
  requestInit: { headers: { origin: base.origin } },
});
const local = new StdioServerTransport();
local.onmessage = (message) => {
  queue = queue.then(() => upstream.send(message)).catch((e) => log(`send failed: ${(e as Error).message}`));
};
upstream.onmessage = (message) => void local.send(message);
upstream.onerror = (e) => log(`upstream error: ${e.message}`);
local.onclose = stop;
upstream.onclose = stop;
process.stdin.on('end', stop);
process.stdin.on('close', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
await upstream.start();
await local.start();
log(`forwarding to ${base.origin}/api/mcp`);
