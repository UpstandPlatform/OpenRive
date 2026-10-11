// Non-interactive commands. `openrive` with no arguments opens the TUI instead.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData, Path2D } from '@napi-rs/canvas';
import initRive from '@rive-app/canvas-advanced';
import { renderInBrowser } from './browser-render';
import { assetBytes, fileAssets } from '@openrive/rive/assets';
import { authEnabled, createAccount, deleteAccountAndTransferProjects, listAccounts, passwordProblem, updateAccount } from '@openrive/auth';
import { deleteLocalUserAndTransferProjects, importLegacyDataDir } from '@openrive/db';
import { outline } from '@openrive/rive/api';
import { buildBundle, bundleFileName, type BundleFile } from '@openrive/rive/bundle';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { diagnoseRiv } from '@openrive/rive/diagnostics';
import { exportSource, exportSourceFiles, importSource, importSourceFiles, isOpenRiveSource } from '@openrive/rive/source';
import { isAdministratorRole, roleSchema } from '@openrive/shared';
import { env } from '@openrive/shared/env';
import {
  createProject,
  deleteProject as deleteStoredProject,
  EXAMPLES,
  importFile,
  importDoc,
  loadDoc,
  PROJECT_ROOT,
  resolveProject,
  storage,
  StoreError,
  TEMPLATES,
} from './project-store';

export const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

/** Reads a line from the terminal without echoing it, for passwords. */
async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new StoreError('Pass --password when there is no terminal to type into');
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  for await (const chunk of stdin) {
    for (const byte of chunk as Buffer) {
      if (byte === 13 || byte === 10) {
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        return value;
      }
      if (byte === 3) {
        stdin.setRawMode(false);
        process.exit(130);
      }
      if (byte === 127 || byte === 8) value = value.slice(0, -1);
      else value += String.fromCharCode(byte);
    }
  }
  return value;
}

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
  if (existsSync(ref) && statSync(ref).isDirectory()) return importSourceFiles(readSourceDirectory(ref));
  if (existsSync(ref) && /\.(riv|oriv)$/i.test(ref)) {
    const bytes = new Uint8Array(readFileSync(ref));
    return isOpenRiveSource(bytes) ? importSource(bytes) : importRiv(bytes);
  }
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

export async function exportProject(args: string[], opts: Options = {}) {
  if (!args[0]) throw new StoreError('Usage: export <project> [out.riv] [--bundle] [--cdn]');
  const { meta, doc } = await loadDoc(args[0]);
  const riv = exportRiv(doc);
  if (!opts.bundle) {
    const out = args[1] ?? `${meta.name.replace(/[^\w\- ]+/g, '').trim() || meta.id}.riv`;
    writeFileSync(out, riv);
    return console.log(`Wrote ${out} (${riv.length} bytes)`);
  }
  const runtime = opts.cdn ? 'cdn' : 'offline';
  const zip = buildBundle({
    name: meta.name,
    riv,
    doc,
    runtime,
    runtimeVersion: runtimeVersion(),
    runtimeFiles: runtime === 'offline' ? runtimeFiles() : undefined,
  });
  // tolerate `--bundle out.zip`, where the parser reads the path as the flag's value
  const out = args[1] ?? (typeof opts.bundle === 'string' ? opts.bundle : bundleFileName(meta.name));
  writeFileSync(out, zip);
  console.log(`Wrote ${out} (${Math.round(zip.length / 1024)} KB) — unzip it, then: npx --yes serve .`);
}

/** The runtime the editor renders with, for offline preview bundles. */
function runtimeDir() {
  const local = path.join(PROJECT_ROOT, 'apps', 'web', 'public', 'rive', 'local');
  return existsSync(path.join(local, 'canvas_advanced.mjs')) ? local : path.join(PROJECT_ROOT, 'apps', 'web', 'public', 'rive');
}

function runtimeVersion() {
  const file = path.join(PROJECT_ROOT, 'apps', 'web', 'public', 'rive', 'runtime.json');
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, 'utf8')) as { version?: string }).version;
}

function runtimeFiles(): BundleFile[] {
  const dir = runtimeDir();
  return ['canvas_advanced.mjs', 'rive.wasm'].map((name) => {
    const file = path.join(dir, name);
    if (!existsSync(file)) throw new StoreError(`Missing the Rive runtime file ${name}. Run "bun install" in the repo, or export with --cdn.`);
    return { name, data: new Uint8Array(readFileSync(file)) };
  });
}

export async function info(args: string[], opts: Options) {
  if (!args[0]) throw new StoreError('Usage: info <project | file.riv>');
  const result = outline(await docFrom(args[0]));
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else printOutline(result);
}

export async function deleteProject(args: string[]) {
  const meta = await resolveProject(args[0] ?? '');
  await deleteStoredProject(meta.id);
  console.log(`Deleted "${meta.name}" (${meta.id})`);
}

export function validate(args: string[]) {
  let failed = 0;
  for (const file of args) {
    try {
      const isFolder = existsSync(file) && statSync(file).isDirectory();
      const bytes = isFolder ? null : new Uint8Array(readFileSync(file));
      if (isFolder || isOpenRiveSource(bytes!)) {
        const sourceReport = isFolder ? diagnoseSourceFiles(readSourceDirectory(file)) : diagnoseSource(bytes!);
        if (!sourceReport.valid) throw new Error(sourceReport.diagnostics.map((d) => d.message).join('; '));
        console.log(`✓ ${file} (editable source)`);
        continue;
      }
      const out = exportRiv(importRiv(bytes!));
      const same = Buffer.from(out).equals(Buffer.from(bytes!));
      console.log(`${same ? '✓' : '≈'} ${file}${same ? ' (byte-identical)' : ' (re-encoded differently)'}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${file}: ${(e as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

function readSourceDirectory(dir: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const maxFiles = 10_000;
  const maxBytes = 512 * 1024 * 1024;
  let fileCount = 0;
  let totalBytes = 0;
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new StoreError(`Editable source folders cannot contain symbolic links: ${file}`);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        if (++fileCount > maxFiles) throw new StoreError(`Editable source folders cannot contain more than ${maxFiles} files`);
        const size = statSync(file).size;
        totalBytes += size;
        if (totalBytes > maxBytes) throw new StoreError('Editable source folders cannot exceed 512 MB');
        files[path.relative(dir, file).split(path.sep).join('/')] = new Uint8Array(readFileSync(file));
      }
    }
  };
  visit(dir);
  return files;
}

export async function sourceCommand(args: string[]) {
  const [sub, ...values] = args;
  if (sub === 'export') {
    if (!values[0]) throw new StoreError('Usage: source export <project|file.riv> [out.oriv]');
    const doc = await docFrom(values[0]);
    const defaultName = path.basename(values[0]).replace(/\.(riv|oriv)$/i, '') || 'openrive-project';
    const out = values[1] ?? `${safeFileName(defaultName)}.oriv`;
    if (/\.oriv$/i.test(out)) {
      writeFileSync(out, exportSource(doc));
      console.log(`Wrote editable OpenRive source archive ${out}`);
    } else {
      mkdirSync(out, { recursive: true });
      for (const [file, bytes] of Object.entries(exportSourceFiles(doc))) {
        const target = path.join(out, ...file.split('/'));
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      }
      console.log(`Wrote Git-friendly editable source folder ${out}`);
    }
    return;
  }
  if (sub === 'import') {
    const file = values[0];
    if (!file) throw new StoreError('Usage: source import <file.oriv> [project name]');
    const isFolder = existsSync(file) && statSync(file).isDirectory();
    const bytes = isFolder ? null : new Uint8Array(readFileSync(file));
    if (!isFolder && !isOpenRiveSource(bytes!)) throw new StoreError(`${file} is not an OpenRive source folder or .oriv archive`);
    const name = values.slice(1).join(' ') || path.basename(file).replace(/\.oriv$/i, '');
    const doc = isFolder ? importSourceFiles(readSourceDirectory(file)) : importSource(bytes!);
    const meta = await importDoc(doc, name);
    console.log(`Imported ${file} → "${meta.name}" (${meta.id})\nOpen: ${editorUrl(meta.id)}`);
    return;
  }
  throw new StoreError('Usage: source export <project|file.riv> [out.oriv] | source import <file.oriv> [name]');
}

function safeFileName(value: string) {
  return value.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'openrive-project';
}

export function diagnose(args: string[], opts: Options) {
  if (!args.length) throw new StoreError('Usage: diagnose <file.riv|file.oriv|source-folder...> [--json]');
  const results = args.map((file) => {
    const isFolder = existsSync(file) && statSync(file).isDirectory();
    const bytes = isFolder ? null : new Uint8Array(readFileSync(file));
    const report = isFolder ? diagnoseSourceFiles(readSourceDirectory(file)) : isOpenRiveSource(bytes!) ? diagnoseSource(bytes!) : diagnoseRiv(bytes!);
    return { file, ...report };
  });
  if (opts.json) console.log(JSON.stringify(results, null, 2));
  else for (const result of results) {
    console.log(`${result.valid ? '✓' : '✗'} ${result.file} — Rive ${result.fileVersion ?? 'unknown'} · ${result.counts.artboards} artboards · ${result.counts.objects} objects`);
    if (!result.diagnostics.length) console.log('  No file health issues found.');
    for (const item of result.diagnostics) console.log(`  ${item.severity.toUpperCase()} ${item.title}: ${item.message}`);
  }
  if (results.some((r) => !r.valid)) process.exitCode = 1;
}

function diagnoseSourceFiles(files: Record<string, Uint8Array>) {
  try {
    const doc = importSourceFiles(files);
    const report = diagnoseRiv(exportRiv(doc));
    return { ...report, roundTripsByteIdentically: null };
  } catch (error) {
    return {
      valid: false,
      fileVersion: null,
      roundTripsByteIdentically: null,
      counts: { artboards: 0, objects: 0, timelines: 0, stateMachines: 0, assets: 0 },
      diagnostics: [{ code: 'invalid-source', severity: 'error' as const, title: 'Could not read this editable source', message: (error as Error).message }],
    };
  }
}

/** Render one still frame with the same official Rive WASM runtime as the editor. */
export async function render(args: string[], opts: Options) {
  if (!args[0]) throw new StoreError('Usage: render <project|file.riv|file.oriv> [out.png] [--artboard <name|index>] [--animation <name|index>] [--time <seconds>] [--scale <factor>]');
  const doc = await docFrom(args[0]);
  const artboardRef = String(opts.artboard ?? '0');
  const artboardIndex = /^\d+$/.test(artboardRef) ? Number(artboardRef) : doc.artboards.findIndex((a) => a.artboard.props.name === artboardRef);
  const abDoc = doc.artboards[artboardIndex];
  if (!abDoc) throw new StoreError(`Artboard "${artboardRef}" not found`);
  const animationRef = opts.animation === undefined ? '' : String(opts.animation);
  const animationIndex = animationRef === '' ? -1 : /^\d+$/.test(animationRef) ? Number(animationRef) : abDoc.animations.findIndex((a) => a.props.name === animationRef);
  if (animationRef && !abDoc.animations[animationIndex]) throw new StoreError(`Timeline "${animationRef}" not found on artboard "${String(abDoc.artboard.props.name)}"`);
  if (typeof opts.time === 'boolean' || (typeof opts.time === 'string' && !opts.time.trim())) throw new StoreError('--time requires a finite, non-negative number of seconds');
  if (typeof opts.scale === 'boolean' || (typeof opts.scale === 'string' && !opts.scale.trim())) throw new StoreError('--scale requires a finite number greater than zero');
  const requestedTime = Number(opts.time ?? 0);
  const requestedScale = Number(opts.scale ?? 1);
  if (!Number.isFinite(requestedTime) || requestedTime < 0) throw new StoreError('--time must be a finite, non-negative number of seconds');
  if (!Number.isFinite(requestedScale) || requestedScale <= 0 || requestedScale > 4) throw new StoreError('--scale must be a finite number greater than zero and no greater than 4');
  const time = requestedTime;
  const scale = requestedScale;
  const width = Math.max(1, Math.round(Number(abDoc.artboard.props.width) * scale));
  const height = Math.max(1, Math.round(Number(abDoc.artboard.props.height) * scale));
  if (width * height > 64_000_000) throw new StoreError('Output exceeds the 64-million-pixel safety limit');
  const output = args[1] ?? `${safeFileName(String(abDoc.artboard.props.name || path.basename(args[0]).replace(/\.(riv|oriv)$/i, '')))}.png`;
  if (opts.renderer !== undefined && opts.renderer !== 'browser' && opts.renderer !== 'software') throw new StoreError('--renderer must be browser or software');
  if (opts.browser !== undefined && (typeof opts.browser !== 'string' || !opts.browser.trim())) throw new StoreError('--browser requires a Chromium executable path');
  const needsBrowser = doc.top.some((asset) => asset.type === 'ImageAsset') || doc.artboards.some((ab) => ab.objects.some((object) => object.type === 'Mesh' || object.type === 'Feather'));
  if (needsBrowser && opts.renderer === 'software') throw new StoreError('This file contains images, meshes, or feathering that require --renderer browser.');
  for (const asset of fileAssets(doc)) {
    if (!assetBytes(asset) && doc.artboards.some((ab) => ab.objects.some((object) => object.props.assetId === asset.id))) throw new StoreError(`Embed asset "${String(asset.props.name || asset.type)}" before rendering locally.`);
  }
  if (needsBrowser || opts.renderer === 'browser' || opts.browser) {
    const png = await renderInBrowser(exportRiv(doc), { width, height, artboardIndex, animationIndex, time, scale, executablePath: typeof opts.browser === 'string' ? opts.browser : undefined });
    writeFileSync(output, png);
    console.log(`Rendered ${output} (${width}×${height}, local browser)`);
    return;
  }
  const runtimeDir = path.dirname(fileURLToPath(import.meta.resolve('@rive-app/canvas-advanced')));
  if (typeof globalThis.ImageData === 'undefined') Object.defineProperty(globalThis, 'ImageData', { value: ImageData });
  if (typeof globalThis.Path2D === 'undefined') Object.defineProperty(globalThis, 'Path2D', { value: Path2D });
  const wasmBinary = Uint8Array.from(readFileSync(path.join(runtimeDir, 'rive.wasm'))).buffer as ArrayBuffer;
  const rive = await initRive({ wasmBinary, locateFile: (file) => path.join(runtimeDir, file === 'canvas_advanced.wasm' ? 'rive.wasm' : file) });
  const file = await rive.load(exportRiv(doc), undefined, false);
  const artboard = file.artboardByIndex(artboardIndex);
  const canvas = createCanvas(width, height);
  const renderer = rive.makeRenderer(canvas as unknown as HTMLCanvasElement);
  const animation = animationIndex >= 0 ? new rive.LinearAnimationInstance(artboard.animationByIndex(animationIndex), artboard) : null;
  try {
    renderer.clear();
    if (animation) {
      animation.time = time;
      animation.apply(1);
    }
    artboard.advance(0);
    renderer.save();
    (renderer as unknown as { transform: (...values: number[]) => void }).transform(scale, 0, 0, scale, 0, 0);
    artboard.draw(renderer);
    renderer.restore();
    // The canvas runtime queues drawing commands until the animation frame resolves.
    rive.resolveAnimationFrame();
    writeFileSync(output, canvas.toBuffer('image/png'));
    console.log(`Rendered ${output} (${width}×${height})`);
  } finally {
    animation?.delete();
    artboard.delete();
    (renderer as { delete?: () => void }).delete?.();
    file.unref?.();
  }
}

function diagnoseSource(bytes: Uint8Array) {
  try {
    const doc = importSource(bytes);
    const report = diagnoseRiv(exportRiv(doc));
    return { ...report, roundTripsByteIdentically: null };
  } catch (error) {
    return {
      valid: false,
      fileVersion: null,
      roundTripsByteIdentically: null,
      counts: { artboards: 0, objects: 0, timelines: 0, stateMachines: 0, assets: 0 },
      diagnostics: [{ code: 'invalid-source', severity: 'error' as const, title: 'Could not read this editable source', message: (error as Error).message }],
    };
  }
}

export async function users(args: string[], opts: Options) {
  const list = authEnabled() ? await listAccounts() : await storage.listUsers();
  const sub = args[0];
  if (!sub) {
    for (const u of list) console.log(`${pad(u.id, 14)}${pad(u.name, 24)}${u.role}`);
    return;
  }
  if (sub === 'add') {
    const name = args.slice(1).join(' ');
    if (!name) throw new StoreError('Usage: users add <name> [--role admin|editor|viewer] [--password <pw>] [--email <email>]');
    const role = roleSchema.catch('editor').parse(opts.role);
    const password = typeof opts.password === 'string' ? opts.password : undefined;
    const account = await createAccount({
      name,
      role,
      password,
      email: typeof opts.email === 'string' ? opts.email : null,
    });
    console.log(`Added ${account.name} (${role})${password ? ' with a password' : ' — set a password with: openrive users password ' + account.name}`);
    return;
  }
  if (sub === 'password') {
    const ref = args.slice(1).join(' ');
    if (!ref) throw new StoreError('Usage: users password <name|id> [--password <pw>]');
    const user = list.find((u) => u.id === ref || u.name.toLowerCase() === ref.toLowerCase());
    if (!user) throw new StoreError(`User "${ref}" not found`);
    const password = typeof opts.password === 'string' ? opts.password : await prompt(`New password for ${user.name}: `);
    const problem = passwordProblem(password);
    if (problem) throw new StoreError(problem);
    await updateAccount(user.id, { password });
    console.log(`Set a new password for ${user.name}. Their other sessions were signed out.`);
    return;
  }
  if (sub === 'role') {
    const role = roleSchema.catch('editor').parse(opts.role ?? args[2]);
    const ref = args[1] ?? '';
    const user = list.find((u) => u.id === ref || u.name.toLowerCase() === ref.toLowerCase());
    if (!user) throw new StoreError(`Usage: users role <name|id> --role admin|editor|viewer`);
    await updateAccount(user.id, { role });
    console.log(`${user.name} is now ${role}`);
    return;
  }
  if (sub === 'remove') {
    const ref = args.slice(1).join(' ');
    const user = list.find((u) => u.id === ref || u.name.toLowerCase() === ref.toLowerCase());
    if (!user) throw new StoreError(`User "${ref}" not found`);
    const rest = list.filter((u) => u.id !== user.id && (!('disabled' in u) || !u.disabled));
    const heir = rest.find((u) => isAdministratorRole(u.role));
    if (!heir) throw new StoreError('Cannot remove the last admin');
    if (authEnabled()) await deleteAccountAndTransferProjects(user.id, heir.id);
    else await deleteLocalUserAndTransferProjects(user.id, heir.id);
    console.log(`Removed ${user.name}; their files now belong to ${heir.name}`);
    return;
  }
  throw new StoreError(`Unknown users command "${sub}". Use: users | users add | users password | users role | users remove`);
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
  if (sub === 'auth' || sub === 'status-auth') {
    const accounts = await listAccounts();
    console.log(`Sign-in: ${authEnabled() ? 'required' : 'off'} (OPENRIVE_AUTH=${env().OPENRIVE_AUTH})
Accounts: ${accounts.length}, with a password: ${accounts.filter((a) => a.hasPassword).length}
${accounts.map((a) => `  ${pad(a.name, 20)}${pad(a.role, 8)}${a.hasPassword ? 'password set' : 'no password'}${a.disabled ? ' (disabled)' : ''}`).join('\n')}`);
    return;
  }
  if (sub === 'import') {
    const result = await importLegacyDataDir(args[1], (m) => console.log(`  ${m}`));
    console.log(result.projects ? `Imported ${result.users} users and ${result.projects} projects.` : 'Nothing to import (no legacy data folder found).');
    return;
  }
  throw new StoreError(`Unknown db command "${sub}". Use: db status | db import [dir]`);
}
