// Stdio MCP bridge for the editor's HTTP MCP endpoint. This keeps the editor,
// CLI and agent on one process and one embedded database.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const DEFAULT_URL = 'http://localhost:3000';
const log = (message: string): void => void process.stderr.write(`[openrive-bridge] ${message}\n`);

async function healthy(base: URL): Promise<boolean> {
  try {
    const response = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const health: unknown = await response.json();
    if (!health || typeof health !== 'object') return false;
    const status = health as { ok?: unknown; storage?: unknown };
    return status.ok === true && (status.storage === 'embedded' || status.storage === 'postgres');
  } catch {
    return false;
  }
}

function alreadyExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (alreadyExited(child)) return true;
  return Promise.race([
    new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))),
    Bun.sleep(timeoutMs).then(() => false),
  ]);
}

async function killWindowsTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('error', () => resolve());
    killer.once('close', () => resolve());
  });
}

async function stopServer(child: ChildProcess | null): Promise<void> {
  if (!child || alreadyExited(child)) return;
  const pid = child.pid;
  if (pid && process.platform === 'win32') {
    await killWindowsTree(pid);
  } else if (pid) {
    try {
      // The detached process owns a process group that includes Next.js.
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        // The process may have exited between the status check and the signal.
      }
    }
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      // The process may have exited before reporting its PID.
    }
  }

  if (await waitForExit(child, 5000)) return;
  if (pid && process.platform === 'win32') {
    await killWindowsTree(pid);
  } else if (pid) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // The process may have exited while the force signal was sent.
      }
    }
  }
  if (!(await waitForExit(child, 3000))) log(`server process ${pid ?? '(unknown)'} did not exit after termination`);
}

function loopbackHost(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname.toLowerCase());
}

async function startLocalServer(base: URL): Promise<ChildProcess> {
  if (base.protocol !== 'http:') throw new Error(`Cannot start a local server for ${base.origin}; use an http:// loopback URL.`);
  if (!loopbackHost(base.hostname)) throw new Error(`No OpenRive server at ${base.origin}`);

  const cli = path.join(import.meta.dir, 'index.ts');
  const webBuildId = path.resolve(import.meta.dir, '../../web/.next/BUILD_ID');
  const serveArgs = [cli, 'serve', '--host', base.hostname.replace(/^\[|\]$/g, ''), '--port', base.port || '80'];
  if (!existsSync(webBuildId)) serveArgs.push('--dev');

  log(`starting openrive serve on ${base.host}${existsSync(webBuildId) ? '' : ' in development mode'}`);
  const child = spawn('bun', serveArgs, {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, OPENRIVE_URL: base.origin },
    detached: true,
    windowsHide: true,
  });
  const spawnError: { value: Error | null } = { value: null };
  child.once('error', (error) => {
    spawnError.value = error;
  });

  try {
    const deadline = Date.now() + 120_000;
    while (!(await healthy(base))) {
      if (spawnError.value) throw new Error(`Could not start OpenRive: ${spawnError.value.message}`);
      if (alreadyExited(child)) throw new Error('openrive serve exited before becoming healthy; see the server log above');
      if (Date.now() > deadline) throw new Error('openrive serve did not become healthy within 120 seconds');
      await Bun.sleep(300);
    }
    return child;
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

export async function startMcpBridge(
  url = process.env.OPENRIVE_URL ?? (import.meta.main ? process.argv[2] : undefined) ?? DEFAULT_URL,
): Promise<void> {
  const base = new URL(url);
  let server: ChildProcess | null = null;
  if (!(await healthy(base))) server = await startLocalServer(base);

  const upstream = new StreamableHTTPClientTransport(new URL('/api/mcp', base), {
    // The route checks Origin as it would for a browser request.
    requestInit: { headers: { origin: base.origin } },
  });
  const local = new StdioServerTransport();

  let queue: Promise<void> = Promise.resolve();
  let stopPromise: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      await queue.catch(() => {});
      await upstream.close().catch(() => {});
      await stopServer(server);
      process.exit(0);
    })();
    return stopPromise;
  };

  local.onmessage = (message) => {
    queue = queue.then(() => upstream.send(message)).catch((error) => {
      log(`send failed: ${(error as Error).message}`);
      void stop();
    });
  };
  upstream.onmessage = (message) => void local.send(message);
  upstream.onerror = (error) => {
    if (!stopPromise) log(`upstream error: ${error.message}`);
  };
  local.onclose = () => void stop();
  upstream.onclose = () => void stop();
  process.stdin.on('end', () => void stop());
  process.stdin.on('close', () => void stop());
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());

  try {
    await upstream.start();
    await local.start();
    log(`forwarding to ${base.origin}/api/mcp`);
  } catch (error) {
    local.onclose = () => {};
    upstream.onclose = () => {};
    await upstream.close().catch(() => {});
    await stopServer(server);
    throw error;
  }
}

if (import.meta.main) {
  startMcpBridge().catch((error) => {
    log((error as Error).message);
    process.exitCode = 1;
  });
}
