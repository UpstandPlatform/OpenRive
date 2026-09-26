// Copies the Rive runtime (wasm + module) into apps/web/public so the editor works
// offline, and records which SDK build the editor is using.
// A runtime built from the vendor/rive-wasm submodule wins: see scripts/rive-sdk.ts.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const webDir = path.join(root, 'apps', 'web');
const dir = path.join(webDir, 'public', 'rive');

const active = Bun.file(path.join(dir, 'runtime.json'));
if (await active.exists()) {
  const info = await active.json().catch(() => null);
  if (info?.source === 'submodule') {
    console.log(`Keeping the runtime built from vendor/rive-wasm (${info.version}). Run "bun run rive:npm" to go back to npm.`);
    process.exit(0);
  }
}

const pkg = await Bun.file(Bun.resolveSync('@rive-app/canvas-advanced/package.json', webDir)).json();
await mkdir(dir, { recursive: true });
for (const file of ['rive.wasm', 'canvas_advanced.mjs']) {
  await Bun.write(path.join(dir, file), Bun.file(Bun.resolveSync(`@rive-app/canvas-advanced/${file}`, webDir)));
}
await Bun.write(
  path.join(dir, 'runtime.json'),
  `${JSON.stringify({ source: 'npm', version: pkg.version, package: '@rive-app/canvas-advanced', syncedAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`Copied the Rive runtime ${pkg.version} (npm) to apps/web/public/rive`);
