// Sign-in, sessions and the rules for who may do what.
//
// Authentication is off for a local, single-user run (the project's login-free
// default) and on when OpenRive is self-hosted against a PostgreSQL server.
// OPENRIVE_AUTH=on|off overrides that.
//
// The accounts themselves are Better Auth's: email and password, no mail to
// verify, no external provider. Better Auth stores them in OpenRive's own
// tables through the Drizzle adapter (see packages/db/src/schema.ts), so an
// account and the person a file belongs to are the same row.
import { betterAuth } from 'better-auth';
import { apiKey } from '@better-auth/api-key';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { hashPassword as hashScrypt, verifyPassword as verifyScrypt } from 'better-auth/crypto';
import { db, schema } from '@openrive/db';
import { createRedisInfrastructure, type RedisInfrastructure } from '@openrive/redis';
import { authRequired, env } from '@openrive/shared/env';
import type { ProjectMeta, Role, User } from '@openrive/shared';
import { and, eq, gt, isNotNull, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { isLegacyHash, verifyLegacyPassword } from './legacy';

export const CREDENTIAL = 'credential';

/** Is a sign-in required for this deployment? */
export const authEnabled = authRequired;

/** Who may create an account from the sign-up page. */
export const signupMode = () => env().OPENRIVE_SIGNUP;

/** Minimum requirements: long enough to matter, no other rules to work around. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters';
  if (password.length > 200) return 'That password is too long';
  return null;
}

// ---------------------------------------------------------------------------
// The Better Auth instance
//
// It is built once, lazily: the database connection is async (it may start an
// embedded PostgreSQL and run migrations first), and nothing should pay for
// that until a request actually needs an account.

const SECRET_KEY = 'auth.secret';

let redisInstance: Promise<RedisInfrastructure | undefined> | null = null;

/** The optional distributed store is shared by Better Auth and health checks. */
function redisStorage(): Promise<RedisInfrastructure | undefined> {
  const configuredUrl = env().OPENRIVE_REDIS_URL;
  return (redisInstance ??= configuredUrl
    ? createRedisInfrastructure({ url: configuredUrl, namespace: 'auth' })
    : Promise.resolve(undefined));
}

/** Verifies the configured Redis dependency without exposing its connection details. */
export async function redisHealth(): Promise<'disabled' | 'ready'> {
  const storage = await redisStorage();
  if (!storage) return 'disabled';
  await storage.ping();
  return 'ready';
}

/** A stable secret for signing cookies: from the environment, or kept in the database. */
async function secret(): Promise<string> {
  const configured = env().OPENRIVE_AUTH_SECRET;
  if (configured) return configured;
  const conn = await db();
  const read = async () => {
    const [row] = await conn.select().from(schema.settings).where(eq(schema.settings.key, SECRET_KEY));
    return typeof row?.value === 'string' ? row.value : null;
  };
  const existing = await read();
  if (existing) return existing;
  const generated = [crypto.randomUUID(), crypto.randomUUID()].join('').replaceAll('-', '');
  await conn.insert(schema.settings).values({ key: SECRET_KEY, value: generated }).onConflictDoNothing();
  // another process may have won the race, so take whatever is stored now
  return (await read()) ?? generated;
}

const COLORS = ['#7c5cff', '#2bb3ff', '#27c498', '#ffb020', '#ff5c7a', '#ff7a2b', '#b45cff', '#5ce1ff'];

function trustedOrigins() {
  const configured = env().OPENRIVE_TRUSTED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean);
  return configured?.length ? configured : [env().OPENRIVE_URL];
}

async function build() {
  const conn = await db();
  const settings = env();
  const redis = await redisStorage();
  if (settings.NODE_ENV === 'production' && authRequired() && !process.env.OPENRIVE_URL) {
    throw new Error('OPENRIVE_URL must be set for production authentication');
  }

  return betterAuth({
    appName: 'OpenRive',
    secret: await secret(),
    // An explicit public URL is required for production auth. Local development
    // and desktop use the restricted loopback host list instead of trusting any
    // Host header.
    baseURL: process.env.OPENRIVE_URL
      ? settings.OPENRIVE_URL
      : { allowedHosts: ['localhost', '127.0.0.1', '[::1]'], fallback: settings.OPENRIVE_URL, protocol: 'http' },
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(conn, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        rateLimit: schema.rateLimit,
        apikey: schema.apiKeys,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // self-hosted OpenRive sends no mail, so there is nothing to verify
      requireEmailVerification: false,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 200,
      password: {
        hash: hashScrypt,
        // accounts made before Better Auth still carry a PBKDF2 hash
        verify: ({ hash, password }) => (isLegacyHash(hash) ? verifyLegacyPassword(password, hash) : verifyScrypt({ hash, password })),
      },
    },
    session: {
      expiresIn: settings.OPENRIVE_SESSION_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 60 * 60,
      // Keep the database as the source of truth for account/session
      // administration while Redis accelerates and distributes rate limits.
      storeSessionInDatabase: true,
    },
    rateLimit: {
      enabled: settings.NODE_ENV === 'production',
      // Use the dedicated hook instead of Better Auth's generic
      // secondaryStorage: the latter caches sessions, while OpenRive revokes
      // sessions directly from PostgreSQL in the admin and CLI paths.
      storage: 'database',
      customStorage: redis
        ? { consume: (key, rule) => redis.consume(key, rule) }
        : undefined,
      window: 10,
      max: 100,
    },
    // OpenRive's own columns on the users table. None of them can be set from a
    // sign-up request: an account does not get to pick its own role.
    user: {
      additionalFields: {
        role: { type: 'string', required: false, input: false, defaultValue: 'editor' },
        color: { type: 'string', required: false, input: false, defaultValue: COLORS[0] },
        position: { type: 'number', required: false, input: false, defaultValue: 0 },
        disabled: { type: 'boolean', required: false, input: false, defaultValue: false },
        lastLoginAt: { type: 'date', required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // the first account to exist runs the server; who may create the rest
          // from the sign-up page is OPENRIVE_SIGNUP
          before: async (user, context) => {
            const [existing] = await conn.select({ id: schema.users.id }).from(schema.users).where(isNotNull(schema.users.email)).limit(1);
            const mode = signupMode();
            if (context?.path === '/sign-up/email' && (mode === 'off' || (mode === 'first' && existing))) {
              throw new APIError('FORBIDDEN', {
                message: existing ? 'An administrator creates the accounts on this server' : 'Accounts on this server are created with the openrive command',
              });
            }
            const count = await conn.$count(schema.users);
            return {
              data: {
                ...user,
                role: existing ? 'editor' : 'admin',
                color: COLORS[count % COLORS.length]!,
                position: count,
              },
            };
          },
        },
      },
      session: {
        create: {
          // a disabled account keeps its files but cannot sign in again
          before: async (session) => {
            const [user] = await conn.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
            if (!user || user.disabled) return false;
            await conn.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
          },
        },
      },
    },
    advanced: {
      cookiePrefix: 'openrive',
      database: { generateId: () => nanoid(10) },
      // behind a reverse proxy the host and protocol arrive in headers
      trustedProxyHeaders: true,
    },
    plugins: [
      apiKey({
        configId: 'mcp',
        defaultPrefix: 'openrive_mcp_',
        requireName: true,
        enableMetadata: true,
        keyExpiration: { defaultExpiresIn: 60 * 60 * 24 * 90, maxExpiresIn: 365 },
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
        permissions: { defaultPermissions: { mcp: ['read', 'write'] } },
      }),
    ],
  });
}

export type Auth = Awaited<ReturnType<typeof build>>;

let instance: Promise<Auth> | null = null;

/** The shared Better Auth instance. */
export function auth(): Promise<Auth> {
  return (instance ??= build().catch((e) => {
    instance = null;
    throw e;
  }));
}

/** Cookie holding the session token, for anything that has to look at it directly. */
export const SESSION_COOKIE = 'openrive.session_token';

// ---------------------------------------------------------------------------
// Accounts, in the shape the rest of OpenRive uses (milliseconds, not dates)

export interface Account extends User {
  email: string | null;
  disabled: boolean;
  lastLoginAt: number | null;
  /** whether a password has been set (never the hash itself) */
  hasPassword: boolean;
}

const toAccount = (row: schema.UserRow, hasPassword: boolean): Account => ({
  id: row.id,
  name: row.name,
  color: row.color,
  role: row.role,
  createdAt: row.createdAt.getTime(),
  email: row.email,
  disabled: row.disabled,
  lastLoginAt: row.lastLoginAt?.getTime() ?? null,
  hasPassword,
});

/** Ids of everyone who can sign in (has a password). */
async function withPassword(): Promise<Set<string>> {
  const conn = await db();
  const rows = await conn
    .select({ userId: schema.accounts.userId })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.providerId, CREDENTIAL), isNotNull(schema.accounts.password)));
  return new Set(rows.map((r) => r.userId));
}

/** True when nobody can sign in yet: the next account created becomes the admin. */
export async function needsSetup(): Promise<boolean> {
  return (await withPassword()).size === 0;
}

export async function listAccounts(): Promise<Account[]> {
  const conn = await db();
  const [rows, passwords] = await Promise.all([
    conn.select().from(schema.users).orderBy(schema.users.position, schema.users.id),
    withPassword(),
  ]);
  return rows.map((row) => toAccount(row, passwords.has(row.id)));
}

export async function getAccount(id: string): Promise<Account | null> {
  const conn = await db();
  const [row] = await conn.select().from(schema.users).where(eq(schema.users.id, id));
  if (!row) return null;
  return toAccount(row, (await withPassword()).has(row.id));
}

/** The account behind a request's cookies, or null when nobody is signed in. */
export async function sessionUser(headers: Headers): Promise<Account | null> {
  const instance = await auth();
  const session = await instance.api.getSession({ headers }).catch(() => null);
  if (!session?.user) return null;
  const account = await getAccount(session.user.id);
  return account && !account.disabled ? account : null;
}

export interface NewAccount {
  name: string;
  password?: string;
  email?: string | null;
  role?: Role;
  color?: string;
}

/**
 * Creates an account directly, for an administrator or the CLI — no request and
 * no session involved. Password hashing goes through Better Auth, so a person
 * made this way signs in exactly like one who signed up.
 */
export async function createAccount(input: NewAccount): Promise<Account> {
  const conn = await db();
  const email = input.email?.trim().toLowerCase() || null;
  if (email) {
    const [taken] = await conn.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (taken) throw new Error('That email is already taken');
  }
  if (input.password) {
    const problem = passwordProblem(input.password);
    if (problem) throw new Error(problem);
    if (!email) throw new Error('An account with a password needs an email to sign in with');
  }
  const count = await conn.$count(schema.users);
  const id = nanoid(10);
  const now = new Date();
  const [row] = await conn
    .insert(schema.users)
    .values({
      id,
      name: input.name.trim(),
      email,
      color: input.color ?? COLORS[count % COLORS.length]!,
      role: input.role ?? 'editor',
      position: count,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (input.password) await setPassword(id, input.password);
  return toAccount(row!, !!input.password);
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
  if (patch.email !== undefined) values.email = patch.email?.trim().toLowerCase() || null;
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.color !== undefined) values.color = patch.color;
  if (patch.disabled !== undefined) values.disabled = patch.disabled;
  if (Object.keys(values).length) {
    values.updatedAt = new Date();
    await conn.update(schema.users).set(values).where(eq(schema.users.id, id));
  }
  if (patch.password !== undefined) {
    const problem = passwordProblem(patch.password);
    if (problem) throw new Error(problem);
    const account = await getAccount(id);
    // without an email there is nothing to sign in with, so a password would
    // be set and never usable
    if (!account?.email) throw new Error('Give the account an email before setting a password');
    await setPassword(id, patch.password);
  }
  // a new password or a disabled account ends every existing session
  if (patch.password !== undefined || patch.disabled) await revokeUserSessions(id);
  return getAccount(id);
}

/** Sets (or replaces) the password of an account. */
async function setPassword(userId: string, password: string) {
  const conn = await db();
  const hash = await hashScrypt(password);
  const [existing] = await conn
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, CREDENTIAL)));
  const now = new Date();
  if (existing) {
    await conn.update(schema.accounts).set({ password: hash, updatedAt: now }).where(eq(schema.accounts.id, existing.id));
    return;
  }
  await conn.insert(schema.accounts).values({
    id: nanoid(20),
    userId,
    accountId: userId,
    providerId: CREDENTIAL,
    password: hash,
    createdAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Sessions

export interface SessionInfo {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  agent: string | null;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const conn = await db();
  const rows = await conn
    .select()
    .from(schema.sessions)
    .where(gt(schema.sessions.expiresAt, new Date()))
    .orderBy(schema.sessions.createdAt);
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    agent: row.userAgent,
  }));
}

export async function endSession(id: string) {
  const conn = await db();
  await conn.delete(schema.sessions).where(eq(schema.sessions.id, id));
}

export async function revokeUserSessions(userId: string) {
  const conn = await db();
  await conn.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** Deletes an account and lets the database cascade its auth records. */
export async function deleteAccount(userId: string) {
  const conn = await db();
  await conn.delete(schema.users).where(eq(schema.users.id, userId));
}

/** Housekeeping: drops sessions that expired. */
export async function purgeExpiredSessions() {
  const conn = await db();
  await conn.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
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

/** Sharing, ownership and deletion are more privileged than editing content. */
export function canManageProject(user: Account | User, project: ProjectMeta): boolean {
  return user.role === 'admin' || project.ownerId === user.id;
}

export function canTransferProject(user: Account | User): boolean {
  return user.role === 'admin';
}

export const canCreateProjects = (user: Account | User) => user.role !== 'viewer';
export const isAdmin = (user: Account | User) => user.role === 'admin';
