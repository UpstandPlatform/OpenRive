// Project access for the CLI, the TUI and the MCP server. Talks to the database
// through @openrive/db, so it works with or without the web app running.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as storage from '@openrive/db';
import { exportRiv, importRiv, type RiveDoc } from '@openrive/rive/document';
import { EXAMPLES, getExample } from '@openrive/rive/examples';
import { getTemplate, TEMPLATES } from '@openrive/rive/templates';
import type { ProjectMeta } from '@openrive/shared';
import { env } from '@openrive/shared/env';
import { parseDoc, stringifyDoc } from '@openrive/shared/serialize';
import { createObjectStorage, legacyProjectRivKey, projectRivKey, type ObjectStorage } from '@openrive/storage';

/** Repository root (apps/cli/src -> ../../..), used for bundled fonts and examples. */
export const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../..');
const WEB_PUBLIC = path.join(PROJECT_ROOT, 'apps', 'web', 'public');

/** The standalone desktop server keeps the workspace layout under its cwd. */
function publicDir(): string {
  const candidates = [WEB_PUBLIC, path.join(process.cwd(), 'apps', 'web', 'public'), path.join(process.cwd(), 'public')];
  return candidates.find((candidate) => existsSync(candidate)) ?? WEB_PUBLIC;
}

export { storage, TEMPLATES, EXAMPLES };

export class StoreError extends Error {}

let objectStorage: Promise<ObjectStorage> | null = null;
const cloudEdition = () => env().OPENRIVE_EDITION === 'cloud';
const blobs = () => (objectStorage ??= Promise.resolve().then(() => createObjectStorage()));

async function saveProjectRiv(id: string, bytes: Uint8Array) {
  if (!cloudEdition()) return { riv: bytes } as const;
  const previous = await storage.getProjectAsset(id);
  const key = projectRivKey(id);
  await (await blobs()).put(key, bytes, 'application/octet-stream');
  const updated = await storage.updateProject(id, { riv: null, rivStorageKey: key });
  if (!updated) {
    await (await blobs()).delete(key);
    throw new StoreError(`Project "${id}" disappeared while saving its file`);
  }
  if (previous?.rivStorageKey && previous.rivStorageKey !== key) await (await blobs()).delete(previous.rivStorageKey);
  return { rivStorageKey: key } as const;
}

async function createStoredProject(input: Parameters<typeof storage.createProject>[0], bytes: Uint8Array) {
  const meta = await storage.createProject({ ...input, riv: cloudEdition() ? undefined : bytes });
  if (!cloudEdition()) return meta;
  let key: string | undefined;
  try {
    key = projectRivKey(meta.id);
    await (await blobs()).put(key, bytes, 'application/octet-stream');
    const pointed = await storage.updateProject(meta.id, { riv: null, rivStorageKey: key });
    if (!pointed) throw new StoreError(`Project "${meta.id}" disappeared while saving its file`);
    return pointed;
  } catch (error) {
    await storage.deleteProject(meta.id);
    if (key) await (await blobs()).delete(key);
    throw error;
  }
}

export async function getProjectRiv(id: string): Promise<Uint8Array | null> {
  const asset = await storage.getProjectAsset(id);
  if (!asset) return null;
  if (asset.riv && cloudEdition()) {
    const key = legacyProjectRivKey(id);
    await (await blobs()).put(key, asset.riv, 'application/octet-stream');
    await storage.updateProject(id, { riv: null, rivStorageKey: key });
    return asset.riv;
  }
  if (asset.riv) return asset.riv;
  return asset.rivStorageKey ? (await blobs()).get(asset.rivStorageKey) : null;
}

export async function deleteProject(id: string) {
  const asset = await storage.getProjectAsset(id);
  await storage.deleteProject(id);
  if (cloudEdition() && asset?.rivStorageKey) await (await blobs()).delete(asset.rivStorageKey);
}

export function loadFont(name = 'Inter') {
  const file = name === 'Inter Bold' ? 'Inter-Bold.ttf' : 'Inter-Regular.ttf';
  const p = path.join(publicDir(), 'fonts', file);
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
  return storage.updateProject(id, { doc: stringifyDoc(doc), ...stats(doc), ...(await saveProjectRiv(id, exportRiv(doc))) });
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
  const doc = fromTemplate ? fromTemplate.build(loadFont()) : importRiv(new Uint8Array(readFileSync(path.join(publicDir(), example!.file))));
  const riv = exportRiv(doc);
  return createStoredProject({
    name,
    ownerId: ownerId ?? (await defaultOwner()),
    doc: stringifyDoc(doc),
    ...stats(doc),
  }, riv);
}

export async function importFile(file: string, name?: string, ownerId?: string) {
  return importBytes(new Uint8Array(readFileSync(file)), name ?? path.basename(file).replace(/\.riv$/i, ''), ownerId);
}

/** Imports already-uploaded bytes; used by the HTTP MCP transport as well as the CLI. */
export async function importBytes(bytes: Uint8Array, name?: string, ownerId?: string) {
  const doc = importRiv(bytes);
  const riv = exportRiv(doc);
  return createStoredProject({
    name: name ?? 'Untitled',
    ownerId: ownerId ?? (await defaultOwner()),
    doc: stringifyDoc(doc),
    ...stats(doc),
  }, riv);
}
