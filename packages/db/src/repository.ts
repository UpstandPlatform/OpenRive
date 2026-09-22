// Users and projects. The only module that talks to the database; the web API,
// the CLI and the MCP server all go through it.
import { idSchema, type ProjectMeta, type User } from '@openrive/shared';
import { asc, desc, eq, notInArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from './client';
import { projects, settings, users, type ProjectRow } from './schema';

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

export async function listUsers(): Promise<User[]> {
  const conn = await db();
  const rows = await conn.select().from(users).orderBy(asc(users.position), asc(users.id));
  if (rows.length) return rows.map(({ position: _position, ...u }) => u);
  const admin: User = { id: nanoid(10), name: 'Admin', color: '#7c5cff', role: 'admin', createdAt: Date.now() };
  await conn.insert(users).values({ ...admin, position: 0 }).onConflictDoNothing();
  return [admin];
}

/** Replaces the whole user list (the user manager edits it as one array). */
export async function saveUsers(list: User[]) {
  const conn = await db();
  const ids = list.map((u) => u.id);
  await conn.transaction(async (tx) => {
    if (ids.length) await tx.delete(users).where(notInArray(users.id, ids));
    else await tx.delete(users);
    for (const [position, user] of list.entries()) {
      await tx
        .insert(users)
        .values({ ...user, position })
        .onConflictDoUpdate({ target: users.id, set: { ...user, position } });
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

export interface CreateProject {
  name: string;
  ownerId: string;
  doc: string;
  riv?: Uint8Array;
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
  riv?: Uint8Array;
};

export async function updateProject(id: string, patch: UpdateProject): Promise<ProjectMeta | null> {
  const conn = await db();
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const [row] = await conn
    .update(projects)
    .set({ ...values, updatedAt: Date.now() })
    .where(eq(projects.id, safeId(id)))
    .returning();
  return row ? toMeta(row) : null;
}

export async function deleteProject(id: string) {
  const conn = await db();
  await conn.delete(projects).where(eq(projects.id, safeId(id)));
}

export async function duplicateProject(id: string, ownerId: string): Promise<ProjectMeta | null> {
  const conn = await db();
  const [row] = await conn.select().from(projects).where(eq(projects.id, safeId(id)));
  if (!row?.doc) return null;
  const now = Date.now();
  const [copy] = await conn
    .insert(projects)
    .values({ ...row, id: nanoid(12), name: `${row.name} Copy`, ownerId, createdAt: now, updatedAt: now })
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
