// Sign-in, sessions and the rules for who may do what.
//
// Authentication is off for a local, single-user run (the project's login-free
// default) and on when OpenRive is self-hosted against a PostgreSQL server.
// OPENRIVE_AUTH=on|off overrides that.
import { db, schema } from '@openrive/db';
import { env } from '@openrive/shared/env';
import type { ProjectMeta, Role, User } from '@openrive/shared';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { hashPassword, passwordProblem, verifyPassword } from './password';

export { hashPassword, passwordProblem, verifyPassword };

export const SESSION_COOKIE = 'openrive_session';

/** Is a sign-in required for this deployment? */
export function authEnabled(): boolean {
  const mode = env().OPENRIVE_AUTH;
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  // 'auto': a database server means a shared deployment, which needs accounts
  return !!env().DATABASE_URL;
}

const sessionMs = () => env().OPENRIVE_SESSION_DAYS * 24 * 60 * 60 * 1000;

export interface Account extends User {
  email: string | null;
  disabled: boolean;
  lastLoginAt: number | null;
  /** whether a password has been set (never the hash itself) */
  hasPassword: boolean;
}

const toAccount = (row: schema.UserRow): Account => ({
  id: row.id,
  name: row.name,
  color: row.color,
  role: row.role,
  createdAt: row.createdAt,
  email: row.email,
  disabled: row.disabled,
  lastLoginAt: row.lastLoginAt,
  hasPassword: !!row.passwordHash,
});

/** True when nobody can sign in yet: the next account created becomes the admin. */
export async function needsSetup(): Promise<boolean> {
  const conn = await db();
  const rows = await conn
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.disabled, false), sql`${schema.users.passwordHash} is not null`))
    .limit(1);
  return rows.length === 0;
}

export async function listAccounts(): Promise<Account[]> {
  const conn = await db();
  const rows = await conn.select().from(schema.users).orderBy(schema.users.position, schema.users.id);
  return rows.map(toAccount);
}

export async function getAccount(id: string): Promise<Account | null> {
  const conn = await db();
  const [row] = await conn.select().from(schema.users).where(eq(schema.users.id, id));
  return row ? toAccount(row) : null;
}

/** Finds an account by email or name, both case-insensitively. */
async function findByLogin(login: string): Promise<schema.UserRow | null> {
  const conn = await db();
  const value = login.trim().toLowerCase();
  const rows = await conn
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${value} or lower(${schema.users.name}) = ${value}`)
    .limit(1);
  return rows[0] ?? null;
}

export interface NewAccount {
  name: string;
  password?: string;
  email?: string | null;
  role?: Role;
  color?: string;
}

const COLORS = ['#7c5cff', '#2bb3ff', '#27c498', '#ffb020', '#ff5c7a', '#ff7a2b', '#b45cff', '#5ce1ff'];

export async function createAccount(input: NewAccount): Promise<Account> {
  const conn = await db();
  const existing = await findByLogin(input.email || input.name);
  if (existing) throw new Error('That name or email is already taken');
  const rows = await conn.select({ id: schema.users.id }).from(schema.users);
  const [row] = await conn
    .insert(schema.users)
    .values({
      id: nanoid(10),
      name: input.name.trim(),
      email: input.email?.trim() || null,
      color: input.color ?? COLORS[rows.length % COLORS.length]!,
      role: input.role ?? 'editor',
      createdAt: Date.now(),
      position: rows.length,
      passwordHash: input.password ? await hashPassword(input.password) : null,
    })
    .returning();
  return toAccount(row!);
}

/** Creates the first administrator. Refuses once anyone can sign in. */
export async function createFirstAdmin(input: { name: string; password: string; email?: string | null }): Promise<Account> {
  if (!(await needsSetup())) throw new Error('An account already exists on this server');
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  const conn = await db();
  // adopt the seeded local user instead of leaving an orphan account behind
  const [seeded] = await conn.select().from(schema.users).where(eq(schema.users.role, 'admin')).limit(1);
  if (seeded && !seeded.passwordHash) {
    const [row] = await conn
      .update(schema.users)
      .set({
        name: input.name.trim(),
        email: input.email?.trim() || null,
        passwordHash: await hashPassword(input.password),
        disabled: false,
        role: 'admin',
      })
      .where(eq(schema.users.id, seeded.id))
      .returning();
    return toAccount(row!);
  }
  return createAccount({ ...input, role: 'admin' });
}

export interface AccountPatch {
  name?: string;
  email?: string | null;
  role?: Role;
  color?: string;
  disabled?: boolean;
  password?: string;
}

export async function updateAccount(id: string, patch: AccountPatch): Promise<Account | null> {
  const conn = await db();
  const values: Partial<schema.UserRow> = {};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.email !== undefined) values.email = patch.email?.trim() || null;
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.color !== undefined) values.color = patch.color;
  if (patch.disabled !== undefined) values.disabled = patch.disabled;
  if (patch.password !== undefined) {
    const problem = passwordProblem(patch.password);
    if (problem) throw new Error(problem);
    values.passwordHash = await hashPassword(patch.password);
  }
  if (!Object.keys(values).length) return getAccount(id);
  const [row] = await conn.update(schema.users).set(values).where(eq(schema.users.id, id)).returning();
  // a new password or a disabled account ends every existing session
  if (patch.password !== undefined || patch.disabled) await revokeUserSessions(id);
  return row ? toAccount(row) : null;
}

// ---------------------------------------------------------------------------
// Sessions

export interface SignedIn {
  user: Account;
  sessionId: string;
  expiresAt: number;
}

export async function signIn(login: string, password: string, agent?: string): Promise<SignedIn | null> {
  const row = await findByLogin(login);
  // hash anyway when the account is unknown, so both paths take the same time
  const ok = await verifyPassword(password, row?.passwordHash ?? null);
  if (!row || !ok || row.disabled) return null;
  const conn = await db();
  await conn.update(schema.users).set({ lastLoginAt: Date.now() }).where(eq(schema.users.id, row.id));
  return { ...(await startSession(row.id, agent)), user: toAccount({ ...row, lastLoginAt: Date.now() }) };
}

export async function startSession(userId: string, agent?: string): Promise<{ sessionId: string; expiresAt: number; user: Account }> {
  const conn = await db();
  const sessionId = nanoid(32);
  const expiresAt = Date.now() + sessionMs();
  await conn.insert(schema.sessions).values({ id: sessionId, userId, createdAt: Date.now(), expiresAt, agent: agent?.slice(0, 200) ?? null });
  await conn.update(schema.users).set({ lastLoginAt: Date.now() }).where(eq(schema.users.id, userId));
  await conn.delete(schema.sessions).where(lt(schema.sessions.expiresAt, Date.now()));
  const user = await getAccount(userId);
  return { sessionId, expiresAt, user: user! };
}

/** The account behind a session cookie, or null when it is missing or expired. */
export async function sessionUser(sessionId: string | undefined): Promise<Account | null> {
  if (!sessionId) return null;
  const conn = await db();
  const [row] = await conn
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sessionId), gt(schema.sessions.expiresAt, Date.now())))
    .limit(1);
  if (!row || row.user.disabled) return null;
  return toAccount(row.user);
}

export async function endSession(sessionId: string) {
  const conn = await db();
  await conn.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export async function revokeUserSessions(userId: string) {
  const conn = await db();
  await conn.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export async function listSessions(): Promise<{ id: string; userId: string; createdAt: number; expiresAt: number; agent: string | null }[]> {
  const conn = await db();
  return conn.select().from(schema.sessions).where(gt(schema.sessions.expiresAt, Date.now())).orderBy(schema.sessions.createdAt);
}

// ---------------------------------------------------------------------------
// Permissions (enforced on the server, not only in the interface)

export function canSeeProject(user: Account | User, project: ProjectMeta): boolean {
  if (user.role === 'admin' || user.role === 'viewer') return true;
  return project.ownerId === user.id || !!project.sharedWith?.includes(user.id);
}

export function canEditProject(user: Account | User, project: ProjectMeta): boolean {
  if (user.role === 'viewer') return false;
  if (user.role === 'admin') return true;
  return project.ownerId === user.id || !!project.sharedWith?.includes(user.id);
}

export const canCreateProjects = (user: Account | User) => user.role !== 'viewer';
export const isAdmin = (user: Account | User) => user.role === 'admin';
