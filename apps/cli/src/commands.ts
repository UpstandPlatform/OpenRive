// Non-interactive commands. `openrive` with no arguments opens the TUI instead.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { importLegacyDataDir } from '@openrive/db';
import { outline } from '@openrive/rive/api';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { roleSchema, USER_COLORS } from '@openrive/shared';
import { env } from '@openrive/shared/env';
import { nanoid } from 'nanoid';
import {
  createProject,
  EXAMPLES,
  importFile,
  loadDoc,
  PROJECT_ROOT,
  resolveProject,
  storage,
  StoreError,
  TEMPLATES,
} from './project-store';

export const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

export const editorUrl = (id: string) => `${env().OPENRIVE_URL.replace(/\/$/, '')}/editor/${id}`;

export interface Options {
  [key: string]: string | boolean | undefined;
}

function printOutline(o: ReturnType<typeof outline>) {
  for (const ab of o.artboards) {
    console.log(`\nArtboard "${ab.name}" ${ab.width}×${ab.height}  (${ab.id})`);
    const walk = (nodes: Record<string, unknown>[], depth: number) => {
      for (const n of nodes) {
        const extra = [n.fill && `fill ${n.fill}`, n.text !== undefined && `"${n.text}"`].filter(Boolean).join(' ');
        console.log(`${'  '.repeat(depth)}• ${n.name ?? n.type} [${n.type}] at ${n.x},${n.y} ${extra}  (${n.id})`);
        if (Array.isArray(n.children)) walk(n.children as Record<string, unknown>[], depth + 1);
      }
    };
    walk(ab.children as Record<string, unknown>[], 1);
    for (const t of ab.timelines) console.log(`  ▶ timeline "${t.name}" ${t.durationSeconds}s @${t.fps}fps ${t.loop}  keys: ${t.keyed.join(', ') || 'none'}`);
    for (const sm of ab.stateMachines) {
      console.log(`  ◆ state machine "${sm.name}"  inputs: ${sm.inputs.map((i) => `${i.name}:${i.type}`).join(', ') || 'none'}  listeners: ${sm.listeners}`);
      for (const l of sm.layers) console.log(`      layer "${l.name}": ${l.states.map((s) => s.timeline ?? s.type.replace('State', '')).join(' → ')}`);
    }
  }
  if (o.themeColors.length) console.log(`\nTheme colors (${o.themes.find((t) => t.active)?.name}): ${o.themeColors.map((c) => `${c.name} ${c.color}`).join(', ')}`);
}

/** Loads a document from a project reference or a .riv path. */
async function docFrom(ref: string) {
  if (ref.toLowerCase().endsWith('.riv') && existsSync(ref)) return importRiv(new Uint8Array(readFileSync(ref)));
  return (await loadDoc(ref)).doc;
}

export async function listProjects() {
  const [users, projects] = await Promise.all([storage.listUsers(), storage.listProjects()]);
  if (!projects.length) return console.log('No projects yet. Try: openrive new "My file" --template bouncing-ball');
  console.log(`${pad('ID', 14)}${pad('NAME', 32)}${pad('OWNER', 14)}${pad('UPDATED', 22)}CONTENT`);
  for (const p of projects) {
    const owner = users.find((u) => u.id === p.ownerId)?.name ?? '?';
    console.log(
      `${pad(p.id, 14)}${pad(p.name, 32)}${pad(owner, 14)}${pad(new Date(p.updatedAt).toLocaleString(), 22)}${p.artboards ?? 0} ab, ${p.animations ?? 0} tl, ${p.stateMachines ?? 0} sm`,
    );
  }
}

export function listTemplates() {
  for (const t of TEMPLATES) console.log(`${pad(t.id, 22)}${t.name} — ${t.description}`);
  for (const e of EXAMPLES) console.log(`${pad(e.id, 22)}${e.name} (example file) — ${e.description}`);
}

export async function serve(opts: Options) {
  const port = String(opts.port ?? env().PORT);
  const host = String(opts.host ?? process.env.HOST ?? 'localhost');
  const dev = !!opts.dev;
  const webDir = path.join(PROJECT_ROOT, 'apps', 'web');
  if (!dev && !existsSync(path.join(webDir, '.next', 'BUILD_ID'))) {
    throw new StoreError('No production build found. Run `bun run build` first, or use `serve --dev`.');
  }
  console.log(`Starting OpenRive on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  if (host === '0.0.0.0') console.log('Listening on all network interfaces. Set OPENRIVE_ACCESS_TOKEN to require a password.');
  const child = Bun.spawn(['bun', 'run', dev ? 'dev' : 'start', '--', '-p', port, '-H', host], {
    cwd: webDir,
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
  });
  process.exit(await child.exited);
}

export async function newProject(args: string[], opts: Options) {
  if (!args.length) throw new StoreError('Usage: new <name> [--template <id>]');
  const meta = await createProject(args.join(' '), typeof opts.template === 'string' ? opts.template : 'blank');
  console.log(`Created "${meta.name}" (${meta.id})\nOpen: ${editorUrl(meta.id)}`);
}

export async function importProjects(args: string[], opts: Options) {
  if (!args.length) throw new StoreError('Usage: import <file.riv...>');
  for (const file of args) {
    const meta = await importFile(file, args.length === 1 && typeof opts.name === 'string' ? opts.name : undefined);
    console.log(`Imported ${file} → "${meta.name}" (${meta.id})`);
  }
}

export async function exportProject(args: string[]) {
  if (!args[0]) throw new StoreError('Usage: export <project> [out.riv]');
  const { meta, doc } = await loadDoc(args[0]);
  const out = args[1] ?? `${meta.name.replace(/[^\w\- ]+/g, '').trim() || meta.id}.riv`;
  const bytes = exportRiv(doc);
  writeFileSync(out, bytes);
  console.log(`Wrote ${out} (${bytes.length} bytes)`);
}

export async function info(args: string[], opts: Options) {
  if (!args[0]) throw new StoreError('Usage: info <project | file.riv>');
  const result = outline(await docFrom(args[0]));
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else printOutline(result);
}

export async function deleteProject(args: string[]) {
  const meta = await resolveProject(args[0] ?? '');
  await storage.deleteProject(meta.id);
  console.log(`Deleted "${meta.name}" (${meta.id})`);
}

export function validate(args: string[]) {
  let failed = 0;
  for (const file of args) {
    const bytes = new Uint8Array(readFileSync(file));
    try {
      const out = exportRiv(importRiv(bytes));
      const same = Buffer.from(out).equals(Buffer.from(bytes));
      console.log(`${same ? '✓' : '≈'} ${file}${same ? ' (byte-identical)' : ' (re-encoded differently)'}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${file}: ${(e as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

export async function users(args: string[], opts: Options) {
  const list = await storage.listUsers();
  const sub = args[0];
  if (!sub) {
    for (const u of list) console.log(`${pad(u.id, 14)}${pad(u.name, 24)}${u.role}`);
    return;
  }
  if (sub === 'add') {
    const name = args.slice(1).join(' ');
    if (!name) throw new StoreError('Usage: users add <name> [--role admin|editor|viewer]');
    const role = roleSchema.catch('editor').parse(opts.role);
    await storage.saveUsers([...list, { id: nanoid(10), name, role, color: USER_COLORS[list.length % USER_COLORS.length]!, createdAt: Date.now() }]);
    console.log(`Added ${name} (${role})`);
    return;
  }
  if (sub === 'remove') {
    const ref = args.slice(1).join(' ');
    const user = list.find((u) => u.id === ref || u.name.toLowerCase() === ref.toLowerCase());
    if (!user) throw new StoreError(`User "${ref}" not found`);
    const rest = list.filter((u) => u.id !== user.id);
    const heir = rest.find((u) => u.role === 'admin');
    if (!heir) throw new StoreError('Cannot remove the last admin');
    for (const p of await storage.listProjects()) if (p.ownerId === user.id) await storage.updateProject(p.id, { ownerId: heir.id });
    await storage.saveUsers(rest);
    console.log(`Removed ${user.name}; their files now belong to ${heir.name}`);
    return;
  }
  throw new StoreError(`Unknown users command "${sub}"`);
}

export async function dbCommand(args: string[]) {
  const sub = args[0] ?? 'status';
  if (sub === 'status') {
    const [{ backend, where }, list, projects] = await Promise.all([storage.describeDatabase(), storage.listUsers(), storage.listProjects()]);
    console.log(`Database: ${backend === 'embedded' ? 'embedded PostgreSQL (PGlite)' : 'PostgreSQL'}
Location: ${where}
Users:    ${list.length}
Projects: ${projects.length}`);
    return;
  }
  if (sub === 'import') {
    const result = await importLegacyDataDir(args[1], (m) => console.log(`  ${m}`));
    console.log(result.projects ? `Imported ${result.users} users and ${result.projects} projects.` : 'Nothing to import (no legacy data folder found).');
    return;
  }
  throw new StoreError(`Unknown db command "${sub}". Use: db status | db import [dir]`);
}
