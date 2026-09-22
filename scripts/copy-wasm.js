// Copies the Rive runtime wasm into /public so the editor works fully offline.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', '@rive-app', 'canvas-advanced', 'rive.wasm');
const dir = path.join(__dirname, '..', 'public', 'rive');
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, path.join(dir, 'rive.wasm'));
console.log('Copied rive.wasm to public/rive');
