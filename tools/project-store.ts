// Node-side access to local projects for the CLI and the MCP server.
// Works directly on the data folder, so it runs with or without the web app.
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { exportRiv, importRiv, RiveDoc } from '../src/lib/rive/document';
import { getTemplate, TEMPLATES } from '../src/lib/rive/templates';
import { EXAMPLES, getExample } from '../src/lib/rive/examples';
import { parseDoc, stringifyDoc } from '../src/lib/serialize';
import type { ProjectMeta } from '../src/lib/types';

export const PROJECT_ROOT = path.resolve(__dirname, '..');
// default to the project's data folder even when started from another directory
process.env.OPENRIVE_DATA_DIR ??= path.join(PROJECT_ROOT, 'data');

// imported after the env var is set
import * as storage from '../src/lib/server/storage-core';
export { storage };

export class StoreError extends Error {}

export function loadFont(name = 'Inter') {
  const file = name === 'Inter Bold' ? 'Inter-Bold.ttf' : 'Inter-Regular.ttf';
  const p = path.join(PROJECT_ROOT, 'public', 'fonts', file);
  if (!existsSync(p)) throw new StoreError(`Bundled font not found at ${p}`);
  return { name: name === 'Inter Bold' ? 'Inter Bold' : 'Inter', bytes: new Uint8Array(readFileSync(p)) };
}

export function stats(doc: RiveDoc) {
  return {
    artboards: doc.artboards.length,
    animations: doc.artboards.reduce((n, a) => n + a.animations.length, 0),
    stateMachines: doc.artboards.reduce((n, a) => n + a.stateMachines.length, 0),
  };
}

/** The user new files belong to: OPENRIVE_USER (id or name), else the first admin. */
export async function defaultOwner(): Promise<string> {
  const users = await storage.listUsers();
  const pref = process.env.OPENRIVE_USER;
  const u = (pref && users.find((x) => x.id === pref || x.name.toLowerCase() === pref.toLowerCase())) || users.find((x) => x.role === 'admin') || users[0];
  return u.id;
}

/** Finds a project by id or (case-insensitive) name. */
export async function resolveProject(ref: string): Promise<ProjectMeta> {
  const all = await storage.listProjects();
  const byId = all.find((p) => p.id === ref);
  if (byId) return byId;
  const byName = all.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new StoreError(`Several projects are named "${ref}". Use the id: ${byName.map((p) => p.id).join(', ')}`);
  throw new StoreError(`Project "${ref}" not found`);
}

export async function loadDoc(ref: string): Promise<{ meta: ProjectMeta; doc: RiveDoc }> {
  const meta = await resolveProject(ref);
  const p = await storage.getProject(meta.id);
  if (!p?.doc) throw new StoreError(`Project "${ref}" has no document`);
  return { meta, doc: parseDoc<RiveDoc>(p.doc) };
}

export async function saveDoc(id: string, doc: RiveDoc) {
  return storage.updateProject(id, { doc: stringifyDoc(doc), riv: exportRiv(doc), ...stats(doc) });
}

/** Loads a project, applies a change and saves it (the open editor picks the change up automatically). */
export async function edit<T>(ref: string, fn: (doc: RiveDoc) => T): Promise<{ meta: ProjectMeta; result: T }> {
  const { meta, doc } = await loadDoc(ref);
  const result = fn(doc);
  const next = await saveDoc(meta.id, doc);
  return { meta: next ?? meta, result };
}

export async function createProject(name: string, template = 'blank', ownerId?: string) {
  const t = getTemplate(template);
  const ex = getExample(template);
  if (!t && !ex) throw new StoreError(`Unknown template "${template}". Available: ${[...TEMPLATES, ...EXAMPLES].map((x) => x.id).join(', ')}`);
  const doc = t ? t.build(loadFont()) : importRiv(new Uint8Array(readFileSync(path.join(PROJECT_ROOT, 'public', ex!.file))));
  const meta = await storage.createProject({ name, ownerId: ownerId ?? (await defaultOwner()), doc: stringifyDoc(doc), riv: exportRiv(doc) });
  return (await storage.updateProject(meta.id, stats(doc))) ?? meta;
}

export async function importFile(file: string, name?: string, ownerId?: string) {
  const bytes = new Uint8Array(readFileSync(file));
  const doc = importRiv(bytes);
  const meta = await storage.createProject({
    name: name ?? path.basename(file).replace(/\.riv$/i, ''),
    ownerId: ownerId ?? (await defaultOwner()),
    doc: stringifyDoc(doc),
    riv: exportRiv(doc),
  });
  return (await storage.updateProject(meta.id, stats(doc))) ?? meta;
}

export { TEMPLATES, EXAMPLES };
