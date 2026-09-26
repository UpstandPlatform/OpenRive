#!/usr/bin/env bun
// Manages the forked Rive SDK submodules under vendor/ and decides which runtime
// build the editor renders with.
//
//   bun run rive:status     what is checked out, built and active
//   bun run rive:init       clone/update the submodules
//   bun run rive:update     pull rive-app's changes into the UpstandPlatform forks
//   bun run rive:build      build the WASM runtime from vendor/rive-wasm
//   bun run rive:sync       make the editor use that build
//   bun run rive:npm        go back to the published npm runtime
//
// See docs/rive-sdk.md.
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const publicRive = path.join(root, 'apps', 'web', 'public', 'rive');
const localRive = path.join(publicRive, 'local');

interface Sub {
  path: string;
  branch: string;
  upstream: string;
  what: string;
}

const SUBMODULES: Sub[] = [
  {
    path: 'vendor/rive-wasm',
    branch: 'master',
    upstream: 'https://github.com/rive-app/rive-wasm.git',
    what: 'JS/WASM SDK — builds @rive-app/canvas-advanced, the runtime the editor renders with',
  },
  {
    path: 'vendor/rive-runtime',
    branch: 'main',
    upstream: 'https://github.com/rive-app/rive-runtime.git',
    what: 'low level C++ runtime and renderer',
  },
];

/** Where vendor/rive-wasm leaves its built canvas-advanced package. */
const BUILD_DIR = path.join(root, 'vendor', 'rive-wasm', 'js', 'npm', 'canvas_advanced');
const BUILT_FILES = ['canvas_advanced.mjs', 'rive.wasm', 'rive_fallback.wasm'];

async function run(cmd: string[], cwd = root, quiet = false) {
  const proc = Bun.spawn(cmd, { cwd, stdout: quiet ? 'pipe' : 'inherit', stderr: quiet ? 'pipe' : 'inherit' });
  const out = quiet ? await new Response(proc.stdout).text() : '';
  const code = await proc.exited;
  return { code, out: out.trim() };
}

const git = (args: string[], cwd = root) => run(['git', ...args], cwd, true);

async function activeRuntime() {
  const file = Bun.file(path.join(publicRive, 'runtime.json'));
  if (!(await file.exists())) return null;
  return (await file.json().catch(() => null)) as { source?: string; version?: string; commit?: string; syncedAt?: string } | null;
}

function checkedOut(sub: Sub) {
  return existsSync(path.join(root, sub.path, '.git'));
}

async function status() {
  console.log('Rive SDK submodules\n');
  for (const sub of SUBMODULES) {
    const dir = path.join(root, sub.path);
    if (!checkedOut(sub)) {
      console.log(`  ${sub.path}  not checked out — run: bun run rive:init`);
      continue;
    }
    const head = (await git(['rev-parse', '--short', 'HEAD'], dir)).out;
    const describe = (await git(['describe', '--tags', '--always'], dir)).out;
    const origin = (await git(['remote', 'get-url', 'origin'], dir)).out;
    const upstream = (await git(['remote', 'get-url', 'upstream'], dir)).out || 'not configured (bun run rive:init adds it)';
    const dirty = (await git(['status', '--porcelain'], dir)).out ? ' (local changes)' : '';
    console.log(`  ${sub.path}  ${head} ${describe}${dirty}`);
    console.log(`    ${sub.what}`);
    console.log(`    fork:     ${origin}`);
    console.log(`    upstream: ${upstream}`);
  }

  const built = existsSync(path.join(BUILD_DIR, 'canvas_advanced.mjs'));
  console.log(`\nBuild in vendor/rive-wasm/js/npm/canvas_advanced: ${built ? 'present' : 'none — run: bun run rive:build'}`);

  const info = await activeRuntime();
  if (!info) console.log('Editor runtime: unknown — run: bun install');
  else if (info.source === 'submodule') console.log(`Editor runtime: vendor/rive-wasm build ${info.version} (${info.commit ?? 'unknown commit'}), synced ${info.syncedAt}`);
  else console.log(`Editor runtime: npm @rive-app/canvas-advanced ${info.version}`);
}

async function init() {
  for (const sub of SUBMODULES) {
    console.log(`Checking out ${sub.path}…`);
    const { code } = await run(['git', 'submodule', 'update', '--init', '--depth', '1', sub.path]);
    if (code !== 0) throw new Error(`Could not check out ${sub.path}`);
    const dir = path.join(root, sub.path);
    if (!(await git(['remote', 'get-url', 'upstream'], dir)).out) {
      await git(['remote', 'add', 'upstream', sub.upstream], dir);
      console.log(`  added upstream ${sub.upstream}`);
    }
  }
  console.log('\nDone. vendor/rive-wasm needs its own submodules to build: git -C vendor/rive-wasm submodule update --init --recursive');
}

async function update() {
  for (const sub of SUBMODULES) {
    const dir = path.join(root, sub.path);
    if (!checkedOut(sub)) {
      console.log(`${sub.path}: not checked out, skipping`);
      continue;
    }
    console.log(`\n${sub.path}: fetching rive-app/${path.basename(sub.path)}…`);
    if (!(await git(['remote', 'get-url', 'upstream'], dir)).out) await git(['remote', 'add', 'upstream', sub.upstream], dir);
    // the submodules are shallow clones, so unshallow before merging history
    if ((await git(['rev-parse', '--is-shallow-repository'], dir)).out === 'true') await run(['git', 'fetch', '--unshallow', 'origin'], dir);
    if ((await run(['git', 'fetch', 'upstream', sub.branch], dir)).code !== 0) throw new Error(`Could not fetch upstream for ${sub.path}`);
    await git(['checkout', sub.branch], dir);
    const merge = await run(['git', 'merge', '--ff-only', `upstream/${sub.branch}`], dir);
    if (merge.code !== 0) {
      console.log(`  ${sub.path} has diverged from upstream — merge it by hand:`);
      console.log(`    git -C ${sub.path} merge upstream/${sub.branch}`);
      continue;
    }
    const head = (await git(['rev-parse', '--short', 'HEAD'], dir)).out;
    console.log(`  now at ${head}. Push it to the fork with: git -C ${sub.path} push origin ${sub.branch}`);
  }
  console.log('\nAfter pushing, record the new commits here: git add vendor && git commit -m "chore: update Rive SDK submodules"');
  console.log('Then rebuild and sync the runtime: bun run rive:build && bun run rive:sync');
}

async function build(args: string[]) {
  const dir = path.join(root, 'vendor', 'rive-wasm');
  if (!checkedOut({ ...SUBMODULES[0]!, path: 'vendor/rive-wasm' })) throw new Error('vendor/rive-wasm is not checked out. Run: bun run rive:init');
  console.log('Building the Rive WASM runtime from vendor/rive-wasm.');
  console.log('This needs Emscripten and the rive-wasm submodules:');
  console.log('  git -C vendor/rive-wasm submodule update --init --recursive\n');
  const { code } = await run(['bash', './build.sh', ...args], path.join(dir, 'js'));
  if (code !== 0) throw new Error('The rive-wasm build failed. See vendor/rive-wasm/CONTRIBUTING.md for its prerequisites.');
  console.log('\nBuilt. Make the editor use it with: bun run rive:sync');
}

async function sync() {
  if (!existsSync(path.join(BUILD_DIR, 'canvas_advanced.mjs'))) {
    throw new Error('No build found in vendor/rive-wasm/js/npm/canvas_advanced. Run: bun run rive:build');
  }
  const pkg = await Bun.file(path.join(BUILD_DIR, 'package.json')).json();
  const commit = (await git(['rev-parse', '--short', 'HEAD'], path.join(root, 'vendor', 'rive-wasm'))).out;
  await mkdir(localRive, { recursive: true });
  for (const name of BUILT_FILES) {
    const from = Bun.file(path.join(BUILD_DIR, name));
    if (!(await from.exists())) continue;
    await Bun.write(path.join(localRive, name), from);
  }
  await Bun.write(
    path.join(publicRive, 'runtime.json'),
    `${JSON.stringify({ source: 'submodule', version: pkg.version, package: 'vendor/rive-wasm', commit, syncedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`The editor now renders with the vendor/rive-wasm build ${pkg.version} (${commit}).`);
  console.log('Restart the dev server (or hard reload) to pick it up. Back to npm: bun run rive:npm');
}

async function useNpm() {
  await rm(localRive, { recursive: true, force: true });
  await rm(path.join(publicRive, 'runtime.json'), { force: true });
  const { code } = await run(['bun', 'run', path.join(root, 'scripts', 'copy-wasm.ts')]);
  if (code !== 0) throw new Error('Could not copy the npm runtime');
}

const [command = 'status', ...rest] = process.argv.slice(2);
const commands: Record<string, () => Promise<void>> = {
  status,
  init,
  update,
  build: () => build(rest),
  sync,
  npm: useNpm,
};

const fn = commands[command];
if (!fn) {
  console.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
await fn().catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
