// Copies the Rive runtime wasm into apps/web/public so the editor works offline.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const source = Bun.resolveSync('@rive-app/canvas-advanced/rive.wasm', path.join(root, 'apps', 'web'));
const dir = path.join(root, 'apps', 'web', 'public', 'rive');

await mkdir(dir, { recursive: true });
await Bun.write(path.join(dir, 'rive.wasm'), Bun.file(source));
console.log('Copied rive.wasm to apps/web/public/rive');
