// Storage for users and projects. Shared by the Next.js API, the CLI and the MCP server.
//
// Backends (see docs/storage.md):
//   - file      (default)            ./data or OPENRIVE_DATA_DIR
//   - postgres  (DATABASE_URL set)   tables are created automatically
import path from 'path';
import { nanoid } from 'nanoid';
import type { ProjectMeta, User } from '../types';
import { fileDriver } from './drivers/file';
import { postgresDriver } from './drivers/postgres';
import type { StorageDriver } from './drivers/types';

export type { StorageDriver } from './drivers/types';

// Resolved lazily so CLI tools can set OPENRIVE_DATA_DIR before first use.
export const dataDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.OPENRIVE_DATA_DIR || process.env.RIVE_EDITOR_DATA_DIR || path.join(process.cwd(), 'data'));

const databaseUrl = () => process.env.DATABASE_URL || process.env.OPENRIVE_DATABASE_URL || '';

let driver: StorageDriver | null = null;
let driverKey = '';

/** The active storage driver (re-created if the configuration changes, e.g. in tests or the CLI). */
export function storage(): StorageDriver {
  const url = databaseUrl();
  const key = url ? `pg:${url}` : `file:${dataDir()}`;
  if (!driver || key !== driverKey) {
    void driver?.close?.();
    driver = url ? postgresDriver(url) : fileDriver(dataDir);
    driverKey = key;
  }
  return driver;
}

export const storageName = () => storage().name;

/** Builds a driver explicitly (used by `openrive migrate`). */
export function createDriver(target: string): StorageDriver {
  return /^postgres(ql)?:\/\//.test(target) ? postgresDriver(target) : fileDriver(() => path.resolve(target));
}

// Validates ids coming from URLs before they touch storage.
export function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid id');
  return id;
}

// ---------------------------------------------------------------------------
// Users

export async function listUsers(): Promise<User[]> {
  const users = await storage().readUsers();
  if (!users.length) {
    const admin: User = { id: nanoid(10), name: 'Admin', color: '#7c5cff', role: 'admin', createdAt: Date.now() };
    await storage().writeUsers([admin]);
    return [admin];
  }
  return users;
}

export async function saveUsers(users: User[]) {
  await storage().writeUsers(users);
}

// ---------------------------------------------------------------------------
// Projects

/**
 * First run: create a welcome project (the interactive OpenRive logo) so new
 * users have something to open. Runs once per data store.
 */
async function ensureSeeded() {
  if (!(await storage().claimFirstRun())) return;
  const [{ openriveLogo }, { exportRiv }, { stringifyDoc }] = await Promise.all([
    import('../rive/templates-brand'),
    import('../rive/document'),
    import('../serialize'),
  ]);
  const users = await listUsers();
  const owner = users.find((u) => u.role === 'admin') ?? users[0];
  const doc = openriveLogo.build();
  const meta = await createProject({ name: 'Welcome to OpenRive', ownerId: owner.id, doc: stringifyDoc(doc), riv: exportRiv(doc) });
  await updateProject(meta.id, { artboards: 1, animations: doc.artboards[0].animations.length, stateMachines: 1 });
}

export async function listProjects(): Promise<ProjectMeta[]> {
  await ensureSeeded();
  const metas = await storage().listMetas();
  return metas.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string) {
  const meta = await storage().readMeta(safeId(id));
  if (!meta) return null;
  return { meta, doc: await storage().readDoc(id) };
}

export async function getProjectRiv(id: string): Promise<Uint8Array | null> {
  return storage().readRiv(safeId(id));
}

export async function createProject(input: { name: string; ownerId: string; doc: string; riv?: Uint8Array }) {
  const now = Date.now();
  const meta: ProjectMeta = { id: nanoid(12), name: input.name || 'Untitled', ownerId: input.ownerId, createdAt: now, updatedAt: now };
  await storage().writeProject(meta, { doc: input.doc, riv: input.riv });
  return meta;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<ProjectMeta, 'name' | 'thumbnail' | 'artboards' | 'animations' | 'stateMachines' | 'ownerId' | 'sharedWith'>> & {
    doc?: string;
    riv?: Uint8Array;
  },
) {
  const meta = await storage().readMeta(safeId(id));
  if (!meta) return null;
  const { doc, riv, ...metaPatch } = patch;
  const next: ProjectMeta = { ...meta, ...metaPatch, updatedAt: Date.now() };
  await storage().writeProject(next, { doc, riv });
  return next;
}

export async function deleteProject(id: string) {
  await storage().deleteProject(safeId(id));
}

export async function duplicateProject(id: string, ownerId: string) {
  const src = await getProject(id);
  if (!src || !src.doc) return null;
  const riv = await getProjectRiv(id);
  const meta = await createProject({ name: `${src.meta.name} Copy`, ownerId, doc: src.doc, riv: riv ?? undefined });
  return updateProject(meta.id, {
    thumbnail: src.meta.thumbnail,
    artboards: src.meta.artboards,
    animations: src.meta.animations,
    stateMachines: src.meta.stateMachines,
  });
}

/** Copies all users and projects from one store to another (existing projects with the same id are overwritten). */
export async function migrate(from: StorageDriver, to: StorageDriver, log: (msg: string) => void = () => {}) {
  const users = await from.readUsers();
  if (users.length) await to.writeUsers(users);
  log(`users: ${users.length}`);
  const metas = await from.listMetas();
  for (const meta of metas) {
    const [doc, riv] = await Promise.all([from.readDoc(meta.id), from.readRiv(meta.id)]);
    await to.writeProject(meta, { doc: doc ?? undefined, riv: riv ?? undefined });
    log(`project: ${meta.name} (${meta.id})`);
  }
  // the target now has data: don't seed a welcome project into it
  await to.claimFirstRun();
  return { users: users.length, projects: metas.length };
}
