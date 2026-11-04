import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dataDir = mkdtempSync(path.join(tmpdir(), 'openrive-db-lock-'));
const childScript = path.join(root, 'scripts', 'db-lock-child.ts');
function spawnChild(mode?: 'hold', childDataDir = dataDir) {
  return Bun.spawn(['bun', childScript, ...(mode ? [mode] : [])], {
    cwd: root,
    env: { ...process.env, OPENRIVE_DATA_DIR: childDataDir } as Record<string, string>,
    stdin: mode ? 'pipe' : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

async function readUntil(stream: ReadableStream<Uint8Array>, marker: string): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';
  while (!output.includes(marker)) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  return output;
}

let owner: ReturnType<typeof Bun.spawn> | null = null;
let aliasRoot: string | null = null;
try {
  owner = spawnChild('hold');
  const ownerOutput = await readUntil(owner.stdout, 'LOCKED');
  assert.match(ownerOutput, /LOCKED/, 'the first process should hold the embedded database lock');

  aliasRoot = mkdtempSync(path.join(tmpdir(), 'openrive-db-lock-alias-'));
  const aliasDataDir = path.join(aliasRoot, 'database');
  symlinkSync(dataDir, aliasDataDir, process.platform === 'win32' ? 'junction' : 'dir');
  const competing = spawnChild(undefined, aliasDataDir);
  const competingOutputPromise = new Response(competing.stderr).text();
  const competingStdoutPromise = new Response(competing.stdout).text();
  const [competingExit, competingError, competingStdout] = await Promise.all([
    competing.exited,
    competingOutputPromise,
    competingStdoutPromise,
  ]);
  assert.equal(competingExit, 2, `a second process should fail clearly; stdout: ${competingStdout}`);
  assert.match(competingError, /in use by process/, 'the lock error should identify the owning process');

  owner.stdin.write('stop\n');
  owner.stdin.end();
  assert.equal(await owner.exited, 0, 'the lock owner should close cleanly');
  owner = null;
  const lockFile = path.join(dataDir, 'pgdata.lock');
  assert.equal(existsSync(lockFile), false, 'closing the database should release the lock file');

  writeFileSync(lockFile, '');
  const incompleteRecovery = spawnChild();
  const [incompleteExit, incompleteOutput, incompleteError] = await Promise.all([
    incompleteRecovery.exited,
    new Response(incompleteRecovery.stdout).text(),
    new Response(incompleteRecovery.stderr).text(),
  ]);
  assert.equal(incompleteExit, 0, `a fresh incomplete lock should not be treated as another live process: ${incompleteError}`);
  assert.match(incompleteOutput, /OPENED/);
  assert.equal(existsSync(lockFile), false, 'incomplete lock recovery should leave no lock behind');

  // A dead PID is a recoverable stale lock, while a live PID is never removed.
  mkdirSync(path.join(dataDir, 'pgdata'), { recursive: true });
  writeFileSync(lockFile, '2147483647');
  const staleRecovery = spawnChild();
  const [recoveryExit, recoveryOutput, recoveryError] = await Promise.all([
    staleRecovery.exited,
    new Response(staleRecovery.stdout).text(),
    new Response(staleRecovery.stderr).text(),
  ]);
  assert.equal(recoveryExit, 0, `a stale lock should be recovered: ${recoveryError}`);
  assert.match(recoveryOutput, /OPENED/);
  assert.equal(existsSync(lockFile), false, 'stale lock recovery should leave no lock behind');

  // Next can bundle the database client into multiple route modules in one
  // server process. Those modules must share the same connection and lock.
  const sharedProcessDir = mkdtempSync(path.join(tmpdir(), 'openrive-db-same-process-'));
  const originalDataDir = process.env.OPENRIVE_DATA_DIR;
  const sharedEnv = await import('@openrive/shared/env');
  try {
    process.env.OPENRIVE_DATA_DIR = sharedProcessDir;
    sharedEnv.resetEnv();
    const firstModule = await import('../packages/db/src/client.ts?instance=one');
    const secondModule = await import('../packages/db/src/client.ts?instance=two');
    const [firstConnection, secondConnection] = await Promise.all([firstModule.database(), secondModule.database()]);
    assert.strictEqual(firstConnection, secondConnection, 'database client bundles in one process should share a connection');
    await firstModule.closeDatabase();
    assert.equal(existsSync(path.join(sharedProcessDir, 'pgdata.lock')), false, 'closing the shared database should release its lock');
  } finally {
    if (originalDataDir === undefined) delete process.env.OPENRIVE_DATA_DIR;
    else process.env.OPENRIVE_DATA_DIR = originalDataDir;
    sharedEnv.resetEnv();
    rmSync(sharedProcessDir, { recursive: true, force: true });
  }
  console.log('database lock ok');
} finally {
  if (owner) {
    owner.stdin.write('stop\n');
    owner.stdin.end();
    await owner.exited;
  }
  if (aliasRoot) rmSync(aliasRoot, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
}
