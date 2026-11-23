// Makes the Linux desktop artifacts installable (issue #15).
//
//   bun scripts/repack-linux-installer.ts repack apps/desktop/artifacts
//   bun scripts/repack-linux-installer.ts smoke apps/desktop/artifacts
//
// Electrobun packs the app as a GNU tar. Paths longer than 100 characters (a few hundred in the bundled Next.js server)
// are stored with GNU "@LongLink" ('L') records, and the Linux installer's built-in tar reader rejects them:
//
//   Extracting application files...
//   Installation failed.
//   error: TarUnsupportedFileType
//
// A POSIX ustar archive keeps long paths in its prefix field instead and extracts fine (pax and GNU both fail), so this
// repacks the same files as ustar and splices the new payload into the installer. `repack` also replaces the update
// archive and drops the delta patches, which were computed against the GNU tar, so the in-app updater downloads the full
// bundle. `smoke` runs the installer the way a user would and checks that it installs.
//
// Needs `tar`, `zstd` and `gzip` on the PATH (all present on the GitHub ubuntu runners).
import { spawnSync } from 'node:child_process';
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Electrobun's marker in front of the compressed app inside the installer binary. */
const MARKER = Buffer.from('ELECTROBUN_ARCHIVE_V1');
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

const [mode, dirArg] = process.argv.slice(2);
const artifacts = path.resolve(dirArg ?? 'apps/desktop/artifacts');

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; capture?: boolean } = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0 && !options.capture) throw new Error(`${command} ${args.slice(0, 3).join(' ')} … exited with ${result.status}`);
  return result;
}

function find(pattern: RegExp, what: string): string {
  const match = readdirSync(artifacts).find((name) => pattern.test(name));
  if (!match) throw new Error(`no ${what} in ${artifacts}: ${readdirSync(artifacts).join(', ')}`);
  return path.join(artifacts, match);
}

/**
 * Throws when the tar has entries other than plain files, directories and symlinks. In particular GNU long-name
 * ('L'/'K') and pax ('x'/'g') records are what the installer cannot read.
 */
function assertPlainTar(file: string) {
  const fd = openSync(file, 'r');
  const header = Buffer.alloc(512);
  const seen: Record<string, number> = {};
  let offset = 0;
  const total = statSync(file).size;
  try {
    while (offset + 512 <= total) {
      readSync(fd, header, 0, 512, offset);
      if (header.every((byte) => byte === 0)) {
        offset += 512;
        continue;
      }
      const type = String.fromCharCode(header[156] || 48);
      seen[type] = (seen[type] ?? 0) + 1;
      const size = parseInt(header.subarray(124, 136).toString('latin1').replace(/\0.*$/, '').trim() || '0', 8);
      if (!['0', '5', '2'].includes(type)) {
        throw new Error(`${path.basename(file)} has a '${type}' tar entry the Linux installer cannot read (entries: ${JSON.stringify(seen)})`);
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } finally {
    closeSync(fd);
  }
  return seen;
}

function repack() {
  const installerTgz = find(/^linux-.+-OpenRive-Setup\.tar\.gz$/, 'Linux installer (.tar.gz)');
  const updateArchive = find(/^(stable|canary)-linux-.+-OpenRive\.tar\.zst$/, 'Linux update archive (.tar.zst)');
  const work = mkdtempSync(path.join(tmpdir(), 'openrive-linux-repack-'));
  try {
    // the app, as a ustar tar
    const gnuTar = path.join(work, 'app.gnu.tar');
    const root = path.join(work, 'root');
    mkdirSync(root);
    run('zstd', ['-d', '-q', '-f', updateArchive, '-o', gnuTar]);
    run('tar', ['-xpf', gnuTar, '-C', root]);
    rmSync(gnuTar);
    const members = readdirSync(root).sort();
    const ustar = path.join(work, 'app.ustar.tar');
    const packed = run('tar', ['--format=ustar', '--sort=name', '--owner=0', '--group=0', '--numeric-owner', '-cf', ustar, '-C', root, ...members], { capture: true });
    if (packed.status !== 0) {
      throw new Error(`a path in the app is too long for a ustar archive (255 characters):\n${packed.stderr}`);
    }
    rmSync(root, { recursive: true, force: true });
    const counts = assertPlainTar(ustar);
    console.log(`repacked as ustar: ${JSON.stringify(counts)}`);
    const zst = path.join(work, 'app.tar.zst');
    run('zstd', ['-q', '-f', '-15', '-T0', ustar, '-o', zst]);

    // the installer: same program, new payload after the marker
    const unpacked = path.join(work, 'installer');
    mkdirSync(unpacked);
    run('tar', ['-xzf', installerTgz, '-C', unpacked]);
    const binaryPath = path.join(unpacked, 'installer');
    const binary = readFileSync(binaryPath);
    // the marker text also appears in the installer's own code (it is what the program searches for), so take the
    // occurrence that is followed by the compressed app
    let payloadAt = -1;
    for (let at = binary.indexOf(MARKER); at >= 0; at = binary.indexOf(MARKER, at + 1)) {
      if (binary.subarray(at + MARKER.length, at + MARKER.length + 4).equals(ZSTD_MAGIC)) payloadAt = at + MARKER.length;
    }
    if (payloadAt < 0) throw new Error('the installer has no ELECTROBUN_ARCHIVE_V1 marker followed by a zstd stream, so its layout changed');
    writeFileSync(binaryPath, Buffer.concat([binary.subarray(0, payloadAt), readFileSync(zst)]));
    chmodSync(binaryPath, 0o755);

    run('tar', ['-czf', installerTgz, '-C', unpacked, '.']);
    writeFileSync(updateArchive, readFileSync(zst));
    for (const name of readdirSync(artifacts)) {
      if (/linux/.test(name) && name.endsWith('.patch')) {
        rmSync(path.join(artifacts, name));
        console.log(`removed ${name} (it was computed against the GNU tar)`);
      }
    }
    console.log(`wrote ${path.basename(installerTgz)} and ${path.basename(updateArchive)}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Runs the installer as a user would, into a throwaway home folder, and checks that it really installed. */
function smoke() {
  const installerTgz = find(/^linux-.+-OpenRive-Setup\.tar\.gz$/, 'Linux installer (.tar.gz)');
  const work = mkdtempSync(path.join(tmpdir(), 'openrive-linux-smoke-'));
  try {
    run('tar', ['-xzf', installerTgz, '-C', work]);
    const home = path.join(work, 'home');
    mkdirSync(home);
    const env = { ...process.env, HOME: home, XDG_DATA_HOME: path.join(home, '.local', 'share'), DISPLAY: '', WAYLAND_DISPLAY: '' };
    const result = run(path.join(work, 'installer'), [], { env, capture: true });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const lines = output.split('\n').filter((line) => !line.startsWith('DEBUG:'));
    console.log(lines.slice(-12).join('\n'));
    const installed = path.join(home, '.local', 'share', 'dev.openrive.app');
    const count = (dir: string): number =>
      existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).reduce((n, entry) => n + (entry.isDirectory() ? count(path.join(dir, entry.name)) : 1), 0) : 0;
    const files = count(installed);
    if (result.status !== 0 || !/Installation completed successfully/.test(output) || files < 1000) {
      throw new Error(`the installer did not install the app (exit ${result.status}, ${files} files under ${installed})`);
    }
    console.log(`installer smoke test passed: ${files} files installed`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (mode === 'repack') repack();
else if (mode === 'smoke') smoke();
else {
  console.error('usage: bun scripts/repack-linux-installer.ts <repack|smoke> [artifacts-dir]');
  process.exit(1);
}
