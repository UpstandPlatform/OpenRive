// Builds the web app in standalone mode and stages it for the desktop bundle at
// apps/desktop/build/server, which electrobun.config.ts copies into the app.
import { $ } from 'bun';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const web = path.join(root, 'apps', 'web');
const out = path.join(root, 'apps', 'desktop', 'build', 'server');

await $`bun run build`.cwd(web).env({ ...process.env, NEXT_OUTPUT: 'standalone' });

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// The standalone output keeps the workspace layout, so server.js sits under apps/web.
const standalone = path.join(web, '.next', 'standalone');
// symlinked workspace packages must become real files inside the app bundle
await cp(standalone, out, { recursive: true, dereference: true });
await cp(path.join(web, '.next', 'static'), path.join(out, 'apps', 'web', '.next', 'static'), { recursive: true, dereference: true });
await cp(path.join(web, 'public'), path.join(out, 'apps', 'web', 'public'), { recursive: true, dereference: true });

// server.js expects to run from its own folder; add a tiny entry at the root of the copy
await Bun.write(path.join(out, 'server.js'), `import('./apps/web/server.js');\n`);

console.log(`Staged the standalone server at ${path.relative(root, out)}`);
