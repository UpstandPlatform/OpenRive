// Users and projects. The only module that talks to the database; the web API,
// the CLI and the MCP server all go through it.
import { idSchema, type ProjectMeta, type User } from '@openrive/shared';
import { and, asc, desc, eq, notInArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from './client';
import { projects, settings, users, type ProjectRow, type UserRow } from './schema';

const toMeta = (row: ProjectRow): ProjectMeta => ({
  id: row.id,
  name: row.name,
  ownerId: row.ownerId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  ...(row.thumbnail ? { thumbnail: row.thumbnail } : {}),
  ...(row.artboards != null ? { artboards: row.artboards } : {}),
  ...(row.animations != null ? { animations: row.animations } : {}),
  ...(row.stateMachines != null ? { stateMachines: row.stateMachines } : {}),
  ...(row.sharedWith?.length ? { sharedWith: row.sharedWith } : {}),
});

export const safeId = (id: string) => idSchema.parse(id);

// ---------------------------------------------------------------------------
// Users

/**
 * The people a file can belong to. Timestamps are milliseconds everywhere above
 * this layer; the accounts tables store them as dates, so they convert here.
 */
export const toUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  color: row.color,
  role: row.role,
  createdAt: row.createdAt.getTime(),
});

export async function listUsers(): Promise<User[]> {
  const conn = await db();
  const rows = await conn.select().from(users).orderBy(asc(users.position), asc(users.id));
  if (rows.length) return rows.map(toUser);
  return conn.transaction(async (tx) => {
    const current = await tx.select().from(users).orderBy(asc(users.position), asc(users.id));
    if (current.length) return current.map(toUser);
    const generatedAdmin: User = { id: nanoid(10), name: 'Admin', color: '#7c5cff', role: 'admin', createdAt: Date.now() };
    const [claim] = await tx
      .insert(settings)
      .values({ key: 'local.initial-admin', value: generatedAdmin.id })
      .onConflictDoNothing()
      .returning();
    const [storedClaim] = await tx.select().from(settings).where(eq(settings.key, 'local.initial-admin'));
    const claimedId = typeof storedClaim?.value === 'string' ? storedClaim.value : generatedAdmin.id;
    const admin = { ...generatedAdmin, id: claimedId };
    if (!claim) {
      const afterClaim = await tx.select().from(users).orderBy(asc(users.position), asc(users.id));
      if (afterClaim.length) return afterClaim.map(toUser);
    }
    const [row] = await tx
      .insert(users)
      .values({ ...admin, createdAt: new Date(admin.createdAt), position: 0 })
      .onConflictDoNothing()
      .returning();
    if (row) return [toUser(row)];
    const afterInsert = await tx.select().from(users).orderBy(asc(users.position), asc(users.id));
    return afterInsert.map(toUser);
  });
}

/** Replaces the whole user list (the user manager edits it as one array). */
export async function saveUsers(list: User[]) {
  const conn = await db();
  const ids = list.map((u) => u.id);
  await conn.transaction(async (tx) => {
    if (ids.length) await tx.delete(users).where(notInArray(users.id, ids));
    else await tx.delete(users);
    for (const [position, user] of list.entries()) {
      const row = { ...user, createdAt: new Date(user.createdAt), position };
      await tx.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row });
    }
  });
}

// ---------------------------------------------------------------------------
// Projects

export async function listProjects(): Promise<ProjectMeta[]> {
  await ensureSeeded();
  const conn = await db();
  const rows = await conn.select().from(projects).orderBy(desc(projects.updatedAt));
  return rows.map(toMeta);
}

export async function getProjectMeta(id: string): Promise<ProjectMeta | null> {
  const conn = await db();
  const [row] = await conn.select().from(projects).where(eq(projects.id, safeId(id)));
  return row ? toMeta(row) : null;
}

export async function getProject(id: string): Promise<{ meta: ProjectMeta; doc: string | null } | null> {
  const conn = await db();
  const [row] = await conn.select().from(projects).where(eq(projects.id, safeId(id)));
  return row ? { meta: toMeta(row), doc: row.doc } : null;
}

export async function getProjectRiv(id: string): Promise<Uint8Array | null> {
  const conn = await db();
  const [row] = await conn.select({ riv: projects.riv }).from(projects).where(eq(projects.id, safeId(id)));
  return row?.riv ?? null;
}

export async function getProjectAsset(id: string): Promise<{ riv: Uint8Array | null; rivStorageKey: string | null; updatedAt: number } | null> {
  const conn = await db();
  const [row] = await conn
    .select({ riv: projects.riv, rivStorageKey: projects.rivStorageKey, updatedAt: projects.updatedAt })
    .from(projects)
    .where(eq(projects.id, safeId(id)));
  return row ? { riv: row.riv, rivStorageKey: row.rivStorageKey, updatedAt: row.updatedAt } : null;
}

export interface CreateProject {
  name: string;
  ownerId: string;
  doc: string;
  riv?: Uint8Array;
  rivStorageKey?: string;
  thumbnail?: string;
  artboards?: number;
  animations?: number;
  stateMachines?: number;
}

export async function createProject(input: CreateProject): Promise<ProjectMeta> {
  const conn = await db();
  const now = Date.now();
  const [row] = await conn
    .insert(projects)
    .values({
      id: nanoid(12),
      name: input.name || 'Untitled',
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
      doc: input.doc,
      riv: input.riv,
      rivStorageKey: input.rivStorageKey,
      thumbnail: input.thumbnail,
      artboards: input.artboards,
      animations: input.animations,
      stateMachines: input.stateMachines,
    })
    .returning();
  return toMeta(row!);
}

export type UpdateProject = Partial<Pick<ProjectMeta, 'name' | 'thumbnail' | 'artboards' | 'animations' | 'stateMachines' | 'ownerId' | 'sharedWith'>> & {
  doc?: string;
  riv?: Uint8Array | null;
  rivStorageKey?: string | null;
};

export async function updateProject(id: string, patch: UpdateProject, options: { expectedUpdatedAt?: number } = {}): Promise<ProjectMeta | null> {
  const conn = await db();
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const where = [eq(projects.id, safeId(id))];
  if (options.expectedUpdatedAt !== undefined) where.push(eq(projects.updatedAt, options.expectedUpdatedAt));
  const [row] = await conn
    .update(projects)
    // Keep the optimistic concurrency token strictly increasing even when two
    // updates arrive in the same millisecond.
    .set({ ...values, updatedAt: sql<number>`GREATEST(${projects.updatedAt} + 1, ${Date.now()})` })
    .where(and(...where))
    .returning();
  return row ? toMeta(row) : null;
}

/** Creates one local user without replacing a concurrently edited user list. */
export async function createLocalUser(user: User): Promise<User> {
  const conn = await db();
  const [row] = await conn
    .insert(users)
    .values({ ...user, createdAt: new Date(user.createdAt), position: user.createdAt })
    .returning();
  return toUser(row!);
}

/** Updates one local user while serializing administrator-role checks. */
export async function updateLocalUser(id: string, patch: Partial<Pick<User, 'name' | 'color' | 'role'>>): Promise<User | null> {
  const conn = await db();
  return conn.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, safeId(id)));
    if (!current) return null;
    if (patch.role && patch.role !== 'admin' && current.role === 'admin') {
      const admins = await tx.execute(sql`SELECT id FROM users WHERE role = 'admin' FOR UPDATE`);
      if (admins.rows.length === 1) throw new Error('At least one admin is required');
    }
    const [row] = await tx.update(users).set(patch).where(eq(users.id, safeId(id))).returning();
    return row ? toUser(row) : null;
  });
}

/** Transfers owned projects and removes one local user in one transaction. */
export async function deleteLocalUserAndTransferProjects(id: string, heirId: string): Promise<boolean> {
  const conn = await db();
  return conn.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ ownerId: safeId(heirId), updatedAt: sql<number>`GREATEST(${projects.updatedAt} + 1, ${Date.now()})` })
      .where(eq(projects.ownerId, safeId(id)));
    const deleted = await tx.delete(users).where(eq(users.id, safeId(id))).returning();
    return deleted.length > 0;
  });
}

export async function deleteProject(id: string, options: { expectedUpdatedAt?: number } = {}): Promise<boolean> {
  const conn = await db();
  const where = [eq(projects.id, safeId(id))];
  if (options.expectedUpdatedAt !== undefined) where.push(eq(projects.updatedAt, options.expectedUpdatedAt));
  const deleted = await conn.delete(projects).where(and(...where)).returning();
  return deleted.length > 0;
}

export async function duplicateProject(id: string, ownerId: string): Promise<ProjectMeta | null> {
  const conn = await db();
  const [row] = await conn.select().from(projects).where(eq(projects.id, safeId(id)));
  if (!row?.doc) return null;
  const now = Date.now();
  const [copy] = await conn
    .insert(projects)
    .values({ ...row, id: nanoid(12), name: `${row.name} Copy`, ownerId, createdAt: now, updatedAt: now, rivStorageKey: null })
    .returning();
  return toMeta(copy!);
}

// ---------------------------------------------------------------------------
// First run

/**
 * On an empty database: import a legacy `data/` folder if one exists, otherwise
 * create the welcome project (the interactive OpenRive logo).
 */
export async function ensureSeeded() {
  const conn = await db();
  const claimed = await conn.insert(settings).values({ key: 'seeded', value: new Date().toISOString() }).onConflictDoNothing().returning();
  if (!claimed.length) return;
  const [existing] = await conn.select({ id: projects.id }).from(projects).limit(1);
  if (existing) return;

  const { importLegacyDataDir } = await import('./legacy');
  const imported = await importLegacyDataDir();
  if (imported.projects) return;

  const [{ openriveLogo }, { exportRiv }, { stringifyDoc }] = await Promise.all([
    import('@openrive/rive/templates-brand'),
    import('@openrive/rive/document'),
    import('@openrive/shared/serialize'),
  ]);
  const list = await listUsers();
  const owner = list.find((u) => u.role === 'admin') ?? list[0]!;
  const doc = openriveLogo.build();
  await createProject({
    name: 'Welcome to OpenRive',
    ownerId: owner.id,
    doc: stringifyDoc(doc),
    riv: exportRiv(doc),
    artboards: 1,
    animations: doc.artboards[0]!.animations.length,
    stateMachines: 1,
  });
}
