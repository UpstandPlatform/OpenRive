#!/usr/bin/env node
// Launcher for the TypeScript CLI (tools/cli.ts) via tsx, from any directory.
const { spawn } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const tsx = pathToFileURL(path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
const child = spawn(process.execPath, ['--import', tsx, path.join(root, 'tools', 'cli.ts'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, OPENRIVE_DATA_DIR: process.env.OPENRIVE_DATA_DIR || path.join(root, 'data') },
});
child.on('exit', (code) => process.exit(code ?? 0));
