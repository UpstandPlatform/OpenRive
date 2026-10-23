// Users and projects. The only module that talks to the database; the web API,
// the CLI and the MCP server all go through it.
import {
  canAssignWorkspaceRole,
  canDeleteWorkspace,
  idSchema,
  isAdministratorRole,
  type ProjectMeta,
  type User,
} from '@openrive/shared';
import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from './client';
import { invitations, members, organizations, projects, sessions, settings, users, type ProjectRow, type UserRow } from './schema';

type ProjectMetaRow = Omit<ProjectRow, 'doc' | 'riv'>;
const toMeta = (row: ProjectMetaRow): ProjectMeta => ({
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
  ...(row.organizationId ? { organizationId: row.organizationId } : {}),
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
  const rows = await conn.select({
    id: projects.id,
    name: projects.name,
    ownerId: projects.ownerId,
    createdAt: projects.createdAt,
    updatedAt: projects.updatedAt,
    thumbnail: projects.thumbnail,
    artboards: projects.artboards,
    animations: projects.animations,
    stateMachines: projects.stateMachines,
    sharedWith: projects.sharedWith,
    organizationId: projects.organizationId,
    rivStorageKey: projects.rivStorageKey,
  }).from(projects).orderBy(desc(projects.updatedAt));
  return rows.map(toMeta);
}

export async function getProjectMeta(id: string): Promise<ProjectMeta | null> {
  const conn = await db();
  const [row] = await conn.select({
    id: projects.id,
    name: projects.name,
    ownerId: projects.ownerId,
    createdAt: projects.createdAt,
    updatedAt: projects.updatedAt,
    thumbnail: projects.thumbnail,
    artboards: projects.artboards,
    animations: projects.animations,
    stateMachines: projects.stateMachines,
    sharedWith: projects.sharedWith,
    organizationId: projects.organizationId,
    rivStorageKey: projects.rivStorageKey,
  }).from(projects).where(eq(projects.id, safeId(id)));
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
  organizationId?: string;
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
      organizationId: input.organizationId,
    })
    .returning();
  return toMeta(row!);
}

export type UpdateProject = Partial<Pick<ProjectMeta, 'name' | 'thumbnail' | 'artboards' | 'animations' | 'stateMachines' | 'ownerId' | 'sharedWith'>> & {
  doc?: string;
  riv?: Uint8Array | null;
  rivStorageKey?: string | null;
};

export async function updateProject(
  id: string,
  patch: UpdateProject,
  options: { expectedUpdatedAt?: number; touchUpdatedAt?: boolean } = {},
): Promise<ProjectMeta | null> {
  const conn = await db();
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const where = [eq(projects.id, safeId(id))];
  if (options.expectedUpdatedAt !== undefined) where.push(eq(projects.updatedAt, options.expectedUpdatedAt));
  const [row] = await conn
    .update(projects)
    // Keep the optimistic concurrency token strictly increasing even when two
    // updates arrive in the same millisecond, unless migrating storage in place.
    .set({
      ...values,
      ...(options.touchUpdatedAt === false ? {} : { updatedAt: sql<number>`GREATEST(${projects.updatedAt} + 1, ${Date.now()})` }),
    })
    .where(and(...where))
    .returning();
  return row ? toMeta(row) : null;
}

/** Workspace membership role used to derive server-side project permissions. */
export async function getOrganizationMemberRole(organizationId: string, userId: string): Promise<string | null> {
  const conn = await db();
  const [member] = await conn.select({ role: members.role }).from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId))).limit(1);
  return member?.role ?? null;
}

/** Organization owners must transfer ownership before their account can be removed. */
export async function listOwnedOrganizationIds(userId: string): Promise<string[]> {
  const conn = await db();
  const rows = await conn.select({ organizationId: members.organizationId, role: members.role }).from(members)
    .where(eq(members.userId, userId));
  return rows.filter((row) => canDeleteWorkspace(row.role)).map((row) => row.organizationId);
}

/** Transfer the single owner role atomically, preserving one owner at every commit. */
export async function transferOrganizationOwnership(organizationId: string, fromUserId: string, toUserId: string): Promise<boolean> {
  const conn = await db();
  try {
    return await conn.transaction(async (tx) => {
      if (fromUserId === toUserId) return false;
      const locked = await tx.select({ id: members.id, userId: members.userId, role: members.role }).from(members)
        .where(and(eq(members.organizationId, organizationId), inArray(members.userId, [fromUserId, toUserId])))
        .orderBy(asc(members.userId))
        .for('update');
      const owner = locked.find((row) => row.userId === fromUserId);
      const target = locked.find((row) => row.userId === toUserId);
      if (!target || !owner || !canDeleteWorkspace(owner.role)) return false;
      // Conditional update is the compare-and-swap guard against two owners
      // transferring simultaneously from the same owner row.
      const demoted = await tx.update(members).set({ role: 'admin' })
        .where(and(eq(members.id, owner.id), eq(members.role, owner.role))).returning();
      if (!demoted.length) return false;
      const promoted = await tx.update(members).set({ role: 'owner' })
        .where(and(eq(members.id, target.id), eq(members.organizationId, organizationId), sql`${members.role} <> 'owner'`))
        .returning();
      if (!promoted.length) throw new Error('The target membership changed during ownership transfer');
      return true;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'The target membership changed during ownership transfer') return false;
    throw error;
  }
}

export type OrganizationMemberRoleUpdate = 'updated' | 'forbidden' | 'missing';

/** Authorizes and applies a role change in one transaction to prevent role-change races. */
export async function updateOrganizationMemberRole(
  organizationId: string,
  actorId: string,
  userId: string,
  role: 'admin' | 'editor' | 'viewer',
): Promise<OrganizationMemberRoleUpdate> {
  const conn = await db();
  return conn.transaction(async (tx) => {
    const locked = await tx.select({ id: members.id, userId: members.userId, role: members.role }).from(members)
      .where(and(eq(members.organizationId, organizationId), inArray(members.userId, [actorId, userId])))
      .orderBy(asc(members.userId))
      .for('update');
    const actor = locked.find((row) => row.userId === actorId);
    if (!actor || !canAssignWorkspaceRole(actor.role, role)) return 'forbidden';
    const target = locked.find((row) => row.userId === userId);
    if (!target || canDeleteWorkspace(target.role)) return 'missing';
    if (!canAssignWorkspaceRole(actor.role, role, target.role)) return 'forbidden';
    const updated = await tx.update(members).set({ role })
      .where(and(eq(members.id, target.id), eq(members.role, target.role)))
      .returning();
    return updated.length ? 'updated' : 'missing';
  });
}

export type DeleteOrganizationResult =
  | { status: 'deleted'; storageKeys: string[] }
  | { status: 'forbidden' | 'missing' | 'name-mismatch'; storageKeys: [] };

/** Deletes a workspace and all of its files atomically, only for its current owner. */
export async function deleteOrganization(
  organizationId: string,
  ownerId: string,
  expectedName: string,
): Promise<DeleteOrganizationResult> {
  const conn = await db();
  return conn.transaction(async (tx) => {
    const [owner] = await tx.select({ id: members.id, role: members.role }).from(members)
      .where(and(eq(members.organizationId, organizationId), eq(members.userId, ownerId)))
      .for('update').limit(1);
    if (!owner || !canDeleteWorkspace(owner.role)) return { status: 'forbidden', storageKeys: [] };

    const [organization] = await tx.select({ name: organizations.name }).from(organizations)
      .where(eq(organizations.id, organizationId)).limit(1);
    if (!organization) return { status: 'missing', storageKeys: [] };
    if (organization.name !== expectedName) return { status: 'name-mismatch', storageKeys: [] };

    const rows = await tx.select({ rivStorageKey: projects.rivStorageKey }).from(projects)
      .where(eq(projects.organizationId, organizationId));
    await tx.delete(projects).where(eq(projects.organizationId, organizationId));
    await tx.update(sessions).set({ activeOrganizationId: null, updatedAt: new Date() })
      .where(eq(sessions.activeOrganizationId, organizationId));
    await tx.delete(invitations).where(eq(invitations.organizationId, organizationId));
    await tx.delete(organizations).where(eq(organizations.id, organizationId));
    return { status: 'deleted', storageKeys: rows.flatMap((row) => row.rivStorageKey ? [row.rivStorageKey] : []) };
  });
}

/** Creates one local user without replacing a concurrently edited user list. */
export async function createLocalUser(user: User): Promise<User> {
  const conn = await db();
  const [row] = await conn
    .insert(users)
    .values({
      ...user,
      createdAt: new Date(user.createdAt),
      position: sql<number>`COALESCE((SELECT MAX(${users.position}) + 1 FROM ${users}), 0)`,
    })
    .returning();
  return toUser(row!);
}

/** Updates one local user while serializing administrator-role checks. */
export async function updateLocalUser(id: string, patch: Partial<Pick<User, 'name' | 'color' | 'role'>>): Promise<User | null> {
  const conn = await db();
  return conn.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, safeId(id)));
    if (!current) return null;
    if (patch.role && !isAdministratorRole(patch.role) && isAdministratorRole(current.role)) {
      const result = await tx.execute(sql`SELECT id FROM users WHERE role = 'admin' FOR UPDATE`);
      const rows = Array.isArray(result) ? result : result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows) ? result.rows : [];
      if (rows.length === 1) throw new Error('At least one admin is required');
    }
    const [row] = await tx.update(users).set(patch).where(eq(users.id, safeId(id))).returning();
    return row ? toUser(row) : null;
  });
}

/** Transfers owned projects and removes one local user in one transaction. */
export async function deleteLocalUserAndTransferProjects(id: string, heirId: string): Promise<boolean> {
  const conn = await db();
  const targetId = safeId(id);
  const nextOwnerId = safeId(heirId);
  if (targetId === nextOwnerId) throw new Error('Choose a different user to receive transferred projects');
  return conn.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, targetId)).for('update');
    if (!current) return false;
    if (isAdministratorRole(current.role)) {
      const result = await tx.execute(sql`SELECT id FROM users WHERE role = 'admin' FOR UPDATE`);
      const rows = Array.isArray(result) ? result : result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows) ? result.rows : [];
      if (rows.length <= 1) throw new Error('At least one admin is required');
    }
    const ownedOrgs = await tx.select({ organizationId: members.organizationId, role: members.role }).from(members)
      .where(eq(members.userId, targetId));
    if (ownedOrgs.some((row) => canDeleteWorkspace(row.role))) {
      throw new Error('Transfer or delete owned workspaces before removing this user');
    }
    await tx
      .update(projects)
      .set({ ownerId: nextOwnerId, updatedAt: sql<number>`GREATEST(${projects.updatedAt} + 1, ${Date.now()})` })
      .where(eq(projects.ownerId, targetId));
    const sharedRows = await tx.select({ id: projects.id, sharedWith: projects.sharedWith }).from(projects);
    for (const row of sharedRows) {
      if (row.sharedWith?.includes(targetId)) {
        const filtered = row.sharedWith.filter((uid) => uid !== targetId);
        await tx.update(projects).set({ sharedWith: filtered.length ? filtered : null }).where(eq(projects.id, row.id));
      }
    }
    const deleted = await tx.delete(users).where(eq(users.id, targetId)).returning();
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
    .values({
      ...row,
      id: nanoid(12),
      name: `${row.name} Copy`,
      ownerId,
      sharedWith: null,
      createdAt: now,
      updatedAt: now,
      rivStorageKey: null,
    })
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
  const [alreadySeeded] = await conn.select({ key: settings.key }).from(settings).where(eq(settings.key, 'seeded')).limit(1);
  if (alreadySeeded) return;
  const [existing] = await conn.select({ id: projects.id }).from(projects).limit(1);
  if (existing) {
    await conn.insert(settings).values({ key: 'seeded', value: new Date().toISOString() }).onConflictDoNothing();
    return;
  }

  const { importLegacyDataDir } = await import('./legacy');
  const imported = await importLegacyDataDir();
  if (imported.projects) {
    await conn.insert(settings).values({ key: 'seeded', value: new Date().toISOString() }).onConflictDoNothing();
    return;
  }

  const [{ openriveLogo }, { exportRiv }, { stringifyDoc }] = await Promise.all([
    import('@openrive/rive/templates-brand'),
    import('@openrive/rive/document'),
    import('@openrive/shared/serialize'),
  ]);
  const list = await listUsers();
  const owner = list.find((u) => isAdministratorRole(u.role)) ?? list[0]!;
  const doc = openriveLogo.build();
  const claimed = await conn.insert(settings).values({ key: 'seeded', value: new Date().toISOString() }).onConflictDoNothing().returning();
  if (!claimed.length) return;
  const [afterClaim] = await conn.select({ id: projects.id }).from(projects).limit(1);
  if (afterClaim) return;
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
