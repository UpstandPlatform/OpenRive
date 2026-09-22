// Project access for the CLI, the TUI and the MCP server. Talks to the database
// through @openrive/db, so it works with or without the web app running.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as storage from '@openrive/db';
import { exportRiv, importRiv, type RiveDoc } from '@openrive/rive/document';
import { EXAMPLES, getExample } from '@openrive/rive/examples';
import { getTemplate, TEMPLATES } from '@openrive/rive/templates';
import type { ProjectMeta } from '@openrive/shared';
import { env } from '@openrive/shared/env';
import { parseDoc, stringifyDoc } from '@openrive/shared/serialize';

/** Repository root (apps/cli/src -> ../../..), used for bundled fonts and examples. */
export const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../..');
const WEB_PUBLIC = path.join(PROJECT_ROOT, 'apps', 'web', 'public');

export { storage, TEMPLATES, EXAMPLES };

export class StoreError extends Error {}

export function loadFont(name = 'Inter') {
  const file = name === 'Inter Bold' ? 'Inter-Bold.ttf' : 'Inter-Regular.ttf';
  const p = path.join(WEB_PUBLIC, 'fonts', file);
  try {
    return { name: name === 'Inter Bold' ? 'Inter Bold' : 'Inter', bytes: new Uint8Array(readFileSync(p)) };
  } catch {
    throw new StoreError(`Bundled font not found at ${p}`);
  }
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
  const preferred = env().OPENRIVE_USER;
  const user =
    (preferred && users.find((u) => u.id === preferred || u.name.toLowerCase() === preferred.toLowerCase())) ||
    users.find((u) => u.role === 'admin') ||
    users[0];
  if (!user) throw new StoreError('No users exist yet');
  return user.id;
}

/** Finds a project by id or (case-insensitive) name. */
export async function resolveProject(ref: string): Promise<ProjectMeta> {
  const all = await storage.listProjects();
  const byId = all.find((p) => p.id === ref);
  if (byId) return byId;
  const byName = all.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) throw new StoreError(`Several projects are named "${ref}". Use the id: ${byName.map((p) => p.id).join(', ')}`);
  throw new StoreError(`Project "${ref}" not found`);
}

export async function loadDoc(ref: string): Promise<{ meta: ProjectMeta; doc: RiveDoc }> {
  const meta = await resolveProject(ref);
  const project = await storage.getProject(meta.id);
  if (!project?.doc) throw new StoreError(`Project "${ref}" has no document`);
  return { meta, doc: parseDoc<RiveDoc>(project.doc) };
}

export async function saveDoc(id: string, doc: RiveDoc) {
  return storage.updateProject(id, { doc: stringifyDoc(doc), riv: exportRiv(doc), ...stats(doc) });
}

/** Loads a project, applies a change and saves it (an open editor picks the change up automatically). */
export async function edit<T>(ref: string, fn: (doc: RiveDoc) => T): Promise<{ meta: ProjectMeta; result: T }> {
  const { meta, doc } = await loadDoc(ref);
  const result = fn(doc);
  const next = await saveDoc(meta.id, doc);
  return { meta: next ?? meta, result };
}

export async function createProject(name: string, template = 'blank', ownerId?: string) {
  const fromTemplate = getTemplate(template);
  const example = getExample(template);
  if (!fromTemplate && !example) {
    throw new StoreError(`Unknown template "${template}". Available: ${[...TEMPLATES, ...EXAMPLES].map((x) => x.id).join(', ')}`);
  }
  const doc = fromTemplate ? fromTemplate.build(loadFont()) : importRiv(new Uint8Array(readFileSync(path.join(WEB_PUBLIC, example!.file))));
  const meta = await storage.createProject({
    name,
    ownerId: ownerId ?? (await defaultOwner()),
    doc: stringifyDoc(doc),
    riv: exportRiv(doc),
    ...stats(doc),
  });
  return meta;
}

export async function importFile(file: string, name?: string, ownerId?: string) {
  const doc = importRiv(new Uint8Array(readFileSync(file)));
  return storage.createProject({
    name: name ?? path.basename(file).replace(/\.riv$/i, ''),
    ownerId: ownerId ?? (await defaultOwner()),
    doc: stringifyDoc(doc),
    riv: exportRiv(doc),
    ...stats(doc),
  });
}
