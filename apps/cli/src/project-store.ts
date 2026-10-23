// Project access for the CLI, the TUI and the MCP server. Talks to the database
// through @openrive/db, so it works with or without the web app running.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as storage from '@openrive/db';
import { exportRiv, importRiv, type RiveDoc } from '@openrive/rive/document';
import { convertLottie, MAX_LOTTIE_INPUT_BYTES, MAX_TGS_COMPRESSED_BYTES } from '@openrive/lottie';
import { EXAMPLES, getExample } from '@openrive/rive/examples';
import { importSource, isOpenRiveSource } from '@openrive/rive/source';
import { getTemplate, TEMPLATES } from '@openrive/rive/templates';
import { isAdministratorRole, MAX_RIV_BYTES, type ProjectMeta } from '@openrive/shared';
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
const blobs = () =>
  (objectStorage ??= Promise.resolve()
    .then(() => createObjectStorage())
    .catch((error) => {
      objectStorage = null;
      throw error;
    }));

export async function closeProjectStore() {
  const client = await objectStorage?.catch(() => null);
  objectStorage = null;
  client?.close();
  await storage.closeDatabase();
}

async function prepareProjectRiv(id: string, bytes: Uint8Array) {
  if (!cloudEdition()) return { patch: { riv: bytes } as const, key: undefined, previousKey: undefined, previousUpdatedAt: undefined };
  const previous = await storage.getProjectAsset(id);
  const key = projectRivKey(id);
  await (await blobs()).put(key, bytes, 'application/octet-stream');
  return { patch: { riv: null, rivStorageKey: key } as const, key, previousKey: previous?.rivStorageKey, previousUpdatedAt: previous?.updatedAt };
}

async function createStoredProject(input: Parameters<typeof storage.createProject>[0], bytes: Uint8Array) {
  const meta = await storage.createProject({ ...input, riv: cloudEdition() ? undefined : bytes });
  if (!cloudEdition()) return meta;
  let key: string | undefined;
  try {
    key = projectRivKey(meta.id);
    await (await blobs()).put(key, bytes, 'application/octet-stream');
    const pointed = await storage.updateProject(meta.id, { riv: null, rivStorageKey: key }, { touchUpdatedAt: false });
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
    await storage.updateProject(id, { riv: null, rivStorageKey: key }, { expectedUpdatedAt: asset.updatedAt, touchUpdatedAt: false });
    return asset.riv;
  }
  if (asset.riv) return asset.riv;
  return asset.rivStorageKey ? (await blobs()).get(asset.rivStorageKey) : null;
}

export async function deleteProject(id: string) {
  const asset = await storage.getProjectAsset(id);
  if (!asset) return;
  const deleted = await storage.deleteProject(id, { expectedUpdatedAt: asset.updatedAt });
  if (!deleted) throw new StoreError(`Project "${id}" changed while it was being deleted; try again`);
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
    users.find((u) => isAdministratorRole(u.role)) ||
    users[0];
  if (!user) throw new StoreError('No users exist yet');
  return user.id;
}

/** Finds a project by id or (case-insensitive) name. */
export async function resolveProject(ref: string, filter?: (project: ProjectMeta) => boolean): Promise<ProjectMeta> {
  const all = (await storage.listProjects()).filter((p) => (filter ? filter(p) : true));
  const byId = all.find((p) => p.id === ref);
  if (byId) return byId;
  const byName = all.filter((p) => p.name.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) throw new StoreError(`Several projects are named "${ref}". Use the id: ${byName.map((p) => p.id).join(', ')}`);
  throw new StoreError(`Project "${ref}" not found`);
}

export async function loadDoc(ref: string | ProjectMeta, filter?: (project: ProjectMeta) => boolean): Promise<{ meta: ProjectMeta; doc: RiveDoc }> {
  const resolved = typeof ref === 'string' ? await resolveProject(ref, filter) : ref;
  const label = typeof ref === 'string' ? ref : ref.id;
  const project = await storage.getProject(resolved.id);
  if (!project?.doc) throw new StoreError(`Project "${label}" has no document`);
  return { meta: project.meta, doc: parseDoc<RiveDoc>(project.doc) };
}

export async function saveDoc(id: string, doc: RiveDoc, expectedUpdatedAt?: number) {
  const prepared = await prepareProjectRiv(id, exportRiv(doc));
  const effectiveExpectedUpdatedAt = expectedUpdatedAt ?? prepared.previousUpdatedAt;
  let updated: ProjectMeta | null;
  try {
    updated = await storage.updateProject(id, { doc: stringifyDoc(doc), ...stats(doc), ...prepared.patch }, { expectedUpdatedAt: effectiveExpectedUpdatedAt });
    if (!updated) throw new StoreError(`Project "${id}" changed while it was being saved; reload and try again`);
  } catch (error) {
    if (prepared.key) await (await blobs()).delete(prepared.key);
    throw error;
  }
  if (prepared.previousKey && prepared.previousKey !== prepared.key) {
    try {
      await (await blobs()).delete(prepared.previousKey);
    } catch (error) {
      console.error('Could not remove an old OpenRive object', error instanceof Error ? error.message : error);
    }
  }
  return updated;
}

/** Loads a project, applies a change and saves it (an open editor picks the change up automatically). */
export async function edit<T>(ref: string | ProjectMeta, fn: (doc: RiveDoc) => T, filter?: (project: ProjectMeta) => boolean): Promise<{ meta: ProjectMeta; result: T }> {
  const { meta, doc } = await loadDoc(ref, filter);
  const result = fn(doc);
  const next = await saveDoc(meta.id, doc, meta.updatedAt);
  return { meta: next ?? meta, result };
}

export async function createProject(name: string, template = 'blank', ownerId?: string, organizationId?: string) {
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
    ...(organizationId ? { organizationId } : {}),
    doc: stringifyDoc(doc),
    ...stats(doc),
  }, riv);
}

export async function importFile(file: string, name?: string, ownerId?: string, organizationId?: string) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.json' || extension === '.tgs') {
    const maxBytes = extension === '.tgs' ? MAX_TGS_COMPRESSED_BYTES : MAX_LOTTIE_INPUT_BYTES;
    if (statSync(file).size > maxBytes) throw new StoreError(`${path.basename(file)} exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB import limit`);
    const { doc } = convertLottie(new Uint8Array(readFileSync(file)), path.basename(file), { font: loadFont() });
    return importDoc(doc, name ?? path.basename(file, extension), ownerId, organizationId);
  }
  if (extension === '.oriv') {
    const bytes = new Uint8Array(readFileSync(file));
    if (!isOpenRiveSource(bytes)) throw new StoreError(`${path.basename(file)} is not a valid OpenRive source archive`);
    return importDoc(importSource(bytes), name ?? path.basename(file, extension), ownerId, organizationId);
  }
  return importBytes(new Uint8Array(readFileSync(file)), name ?? path.basename(file).replace(/\.riv$/i, ''), ownerId, organizationId);
}

/** Imports already-uploaded bytes; used by the HTTP MCP transport as well as the CLI. */
export async function importBytes(bytes: Uint8Array, name?: string, ownerId?: string, organizationId?: string) {
  if (bytes.byteLength > MAX_RIV_BYTES) throw new StoreError('The .riv file is larger than the 100 MB upload limit');
  const doc = importRiv(bytes);
  const riv = exportRiv(doc);
  return createStoredProject({
    name: name ?? 'Untitled',
    ownerId: ownerId ?? (await defaultOwner()),
    ...(organizationId ? { organizationId } : {}),
    doc: stringifyDoc(doc),
    ...stats(doc),
  }, riv);
}

/** Imports an already-decoded editable document using the same storage path for every edition. */
export async function importDoc(doc: RiveDoc, name = 'Untitled', ownerId?: string, organizationId?: string) {
  const riv = exportRiv(doc);
  if (riv.byteLength > MAX_RIV_BYTES) throw new StoreError('The converted .riv file is larger than the 100 MB upload limit');
  return createStoredProject({
    name,
    ownerId: ownerId ?? (await defaultOwner()),
    ...(organizationId ? { organizationId } : {}),
    doc: stringifyDoc(doc),
    ...stats(doc),
  }, riv);
}
