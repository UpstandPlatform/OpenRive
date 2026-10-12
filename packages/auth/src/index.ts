// Sign-in, sessions and the rules for who may do what.
//
// Authentication is off for a local, single-user run (the project's login-free
// default) and on when OpenRive is self-hosted against a PostgreSQL server.
// OPENRIVE_AUTH=on|off overrides that.
//
// The accounts themselves are Better Auth's: email and password, with email
// verification and invitations when delivery is configured. Better Auth stores them in OpenRive's own
// tables through the Drizzle adapter (see packages/db/src/schema.ts), so an
// account and the person a file belongs to are the same row.
import { betterAuth } from 'better-auth';
import { admin, createAccessControl, organization } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { hashPassword as hashScrypt, verifyPassword as verifyScrypt } from 'better-auth/crypto';
import { db, schema } from '@openrive/db';
import { createRedisInfrastructure, type RedisInfrastructure } from '@openrive/redis';
import { authRequired, env } from '@openrive/shared/env';
import {
  canAccessProject,
  canCreateProject,
  canCreateWorkspace,
  canManageAccounts,
  canAssignWorkspaceRole,
  canTransferProject as canTransferProjectPermission,
  hasWorkspaceCapability,
  isAdministratorRole,
  type ProjectMeta,
  type Role,
  type User,
} from '@openrive/shared';
import { and, asc, eq, gt, isNotNull, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import nodemailer, { type Transporter } from 'nodemailer';
import { isLegacyHash, verifyLegacyPassword } from './legacy';

export const CREDENTIAL = 'credential';

const organizationAccess = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
});
function organizationRole(role: 'owner' | 'admin' | 'editor' | 'viewer') {
  return organizationAccess.newRole({
    organization: [
      ...(hasWorkspaceCapability(role, 'renameWorkspace') ? ['update' as const] : []),
      ...(hasWorkspaceCapability(role, 'deleteWorkspace') ? ['delete' as const] : []),
    ],
    member: [
      ...(hasWorkspaceCapability(role, 'inviteMembers') ? ['create' as const] : []),
      ...(hasWorkspaceCapability(role, 'manageMembers') ? ['update' as const, 'delete' as const] : []),
    ],
    invitation: [
      ...(hasWorkspaceCapability(role, 'inviteMembers') ? ['create' as const] : []),
      ...(hasWorkspaceCapability(role, 'manageInvitations') ? ['cancel' as const] : []),
    ],
    team: [],
    ac: ['read'],
  });
}
const ownerRole = organizationRole('owner');
const workspaceAdminRole = organizationRole('admin');
const workspaceEditorRole = organizationRole('editor');
const workspaceViewerRole = organizationRole('viewer');

// Keep account mutations on OpenRive's guarded admin routes. Better Auth's
// plugin exposes read and session-revoke endpoints only.
const accountAdminAccess = createAccessControl({ user: ['list', 'get'], session: ['list', 'revoke'] });
const accountAdminRole = accountAdminAccess.newRole({ user: ['list', 'get'], session: ['list', 'revoke'] });
const accountUserRole = accountAdminAccess.newRole({ user: [], session: [] });

/** Is a sign-in required for this deployment? */
export const authEnabled = authRequired;

/** Cloud accounts must prove control of their address before using OpenRive. */
export const emailVerificationRequired = () => env().OPENRIVE_EDITION === 'cloud';

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
const FIRST_ADMIN_CLAIM = 'auth.first-admin-claim';

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

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function validateOrganizationFields(organization: { name?: string; slug?: string }) {
  if (organization.name !== undefined && (!organization.name.trim() || organization.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(organization.name))) {
    throw new APIError('BAD_REQUEST', { message: 'Workspace names must contain 1 to 80 characters' });
  }
  if (organization.slug !== undefined && (organization.slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organization.slug))) {
    throw new APIError('BAD_REQUEST', { message: 'Workspace slugs must use lowercase letters, numbers, and single hyphens' });
  }
}

let mailTransport: Transporter | null = null;
function sendAuthEmail(to: string, subject: string, text: string, html: string) {
  const settings = env();
  if (!settings.OPENRIVE_EMAIL_FROM || (!settings.RESEND_API_KEY && !settings.OPENRIVE_SMTP_URL)) {
    throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email is not configured on this OpenRive server' });
  }
  if (settings.RESEND_API_KEY) {
    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${settings.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: settings.OPENRIVE_EMAIL_FROM, to: [to], subject, text, html }),
    }).then(async (response) => {
      if (!response.ok) {
        const details = await response.text().catch(() => '');
        console.error('Resend email delivery failed', { status: response.status, details: details.slice(0, 300) });
        throw new Error('Resend email delivery failed');
      }
    });
  }
  mailTransport ??= nodemailer.createTransport({
    url: settings.OPENRIVE_SMTP_URL!,
    requireTLS: settings.OPENRIVE_SMTP_URL!.startsWith('smtp://'),
  });
  return mailTransport.sendMail({ from: settings.OPENRIVE_EMAIL_FROM, to, subject, text, html });
}

const verificationEmailHtml = (name: string, url: string) => {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f4f3f8;color:#191820;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:40px auto;padding:0 16px">
      <div style="padding:24px 28px;background:#17151f;border-radius:16px 16px 0 0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px">OpenRive</div>
      <div style="padding:36px 32px;background:#fff;border:1px solid #e8e6ee;border-top:0;border-radius:0 0 16px 16px">
        <p style="margin:0 0 18px;font-size:16px">Hi ${safeName},</p>
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;letter-spacing:-.5px">Verify your email address</h1>
        <p style="margin:0 0 26px;color:#625f6d;font-size:15px;line-height:1.6">Confirm this address to finish setting up your OpenRive account and access your cloud workspace.</p>
        <p style="margin:0 0 28px"><a href="${safeUrl}" style="display:inline-block;padding:13px 20px;border-radius:9px;background:#7857ff;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Verify email address</a></p>
        <p style="margin:0 0 10px;color:#777481;font-size:12px;line-height:1.5">This link expires in 24 hours. If you did not create an OpenRive account, you can ignore this message.</p>
        <p style="margin:0;color:#777481;font-size:12px;line-height:1.5;word-break:break-all">Button not working? Copy this link:<br>${safeUrl}</p>
      </div>
      <p style="margin:18px 8px 0;color:#888592;text-align:center;font-size:11px">OpenRive · Create and edit Rive files</p>
    </div>
  </body>
</html>`;
};

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
        organization: schema.organizations,
        member: schema.members,
        invitation: schema.invitations,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: settings.OPENRIVE_EDITION === 'cloud',
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 200,
      password: {
        hash: hashScrypt,
        // accounts made before Better Auth still carry a PBKDF2 hash
        verify: ({ hash, password }) => (isLegacyHash(hash) ? verifyLegacyPassword(password, hash) : verifyScrypt({ hash, password })),
      },
    },
    emailVerification: settings.RESEND_API_KEY || settings.OPENRIVE_SMTP_URL
      ? {
          expiresIn: 60 * 60 * 24,
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) => {
            await sendAuthEmail(
              user.email,
              'Verify your OpenRive email address',
              `Hi ${user.name},\n\nVerify your email address to finish setting up OpenRive and access your cloud workspace. This link expires in 24 hours.\n\n${url}\n\nIf you did not create an OpenRive account, you can ignore this message.`,
              verificationEmailHtml(user.name, url),
            );
          },
        }
      : undefined,
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
            // Claim the first administrator through a unique database row. A
            // read-then-insert count lets two simultaneous signups both become
            // administrators; the conflict-safe claim makes the decision once
            // across every application replica.
            const [claim] = await conn
              .insert(schema.settings)
              .values({ key: FIRST_ADMIN_CLAIM, value: crypto.randomUUID() })
              .onConflictDoNothing()
              .returning();
            const count = await conn.$count(schema.users);
            return {
              data: {
                ...user,
                role: existing || !claim ? 'editor' : 'admin',
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
            if (!user || user.disabled || user.banned) return false;
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
      organization({
        ac: organizationAccess,
        roles: { owner: ownerRole, admin: workspaceAdminRole, editor: workspaceEditorRole, viewer: workspaceViewerRole },
        creatorRole: 'owner',
        organizationLimit: 20,
        membershipLimit: 1000,
        invitationExpiresIn: 7 * 24 * 60 * 60,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        disableOrganizationDeletion: true,
        allowUserToCreateOrganization: (user) => authRequired() && canCreateWorkspace(user as unknown as { role: string }),
        organizationHooks: {
          beforeCreateOrganization: async ({ organization }) => {
            validateOrganizationFields(organization);
          },
          beforeUpdateOrganization: async ({ organization }) => {
            validateOrganizationFields(organization);
          },
          beforeAddMember: async ({ member }) => {
            if (hasWorkspaceCapability(member.role, 'deleteWorkspace')) {
              const [existingMembership] = await conn.select({ id: schema.members.id }).from(schema.members)
                .where(eq(schema.members.organizationId, member.organizationId)).limit(1);
              if (!existingMembership) return;
            }
            if (!hasWorkspaceCapability(member.role, 'editProjects') || hasWorkspaceCapability(member.role, 'manageMembers')) {
              throw new APIError('FORBIDDEN', { message: 'Add members as editors or viewers; administrators must be invited by the workspace owner' });
            }
          },
          beforeCreateInvitation: async ({ invitation, inviter }) => {
            if (!(settings.RESEND_API_KEY || settings.OPENRIVE_SMTP_URL) || !settings.OPENRIVE_EMAIL_FROM) {
              throw new APIError('SERVICE_UNAVAILABLE', { message: 'Configure email delivery before inviting workspace members' });
            }
            if (!['admin', 'editor', 'viewer'].includes(invitation.role)) {
              throw new APIError('BAD_REQUEST', { message: 'Choose an allowed workspace role' });
            }
            if (hasWorkspaceCapability(invitation.role, 'manageMembers')) {
              const [membership] = await conn.select({ role: schema.members.role }).from(schema.members)
                .where(and(eq(schema.members.organizationId, invitation.organizationId), eq(schema.members.userId, inviter.id))).limit(1);
              if (!hasWorkspaceCapability(membership?.role, 'assignAdministrators')) throw new APIError('FORBIDDEN', { message: 'Only a workspace owner can invite an administrator' });
            }
          },
          beforeRemoveMember: async ({ member }) => {
            if (hasWorkspaceCapability(member.role, 'deleteWorkspace')) throw new APIError('FORBIDDEN', { message: 'Transfer workspace ownership before removing its owner' });
          },
          beforeUpdateMemberRole: async ({ member, newRole }) => {
            if (!canAssignWorkspaceRole('admin', newRole)) throw new APIError('FORBIDDEN', { message: 'Use Workspace settings to assign administrator access' });
            if (hasWorkspaceCapability(member.role, 'deleteWorkspace')) throw new APIError('FORBIDDEN', { message: 'Transfer workspace ownership through the owner account before changing this role' });
          },
          beforeAcceptInvitation: async ({ invitation, user }) => {
            if (!user.emailVerified) throw new APIError('FORBIDDEN', { message: 'Verify your email address before accepting this invitation' });
            if (user.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
              throw new APIError('FORBIDDEN', { message: 'Sign in with the email address this invitation was sent to' });
            }
          },
        },
        sendInvitationEmail: async ({ id, email, organization: invitedOrganization, inviter }) => {
          const url = new URL('/invite', settings.OPENRIVE_URL);
          url.searchParams.set('id', id);
          const orgName = escapeHtml(invitedOrganization.name);
          const inviterName = escapeHtml(inviter.user.name);
          try {
            await sendAuthEmail(
              email,
              `Invitation to join ${invitedOrganization.name} on OpenRive`,
              `${inviter.user.name} invited you to join ${invitedOrganization.name} on OpenRive. Accept the invitation: ${url.href}`,
              `<p>${inviterName} invited you to join <strong>${orgName}</strong> on OpenRive.</p><p><a href="${escapeHtml(url.href)}">Review invitation</a></p><p>This invitation expires in seven days. If you were not expecting it, you can ignore this email.</p>`,
            );
          } catch {
            // Better Auth persists before invoking the mail callback. Remove a
            // new invite if delivery fails, so the UI cannot imply it was sent.
            await conn.delete(schema.invitations).where(eq(schema.invitations.id, id));
            throw new APIError('SERVICE_UNAVAILABLE', { message: 'Could not deliver the invitation email. Check the server mail configuration and try again.' });
          }
        },
      }),
      admin({
        defaultRole: 'editor',
        adminRoles: ['admin'],
        ac: accountAdminAccess,
        roles: { admin: accountAdminRole, editor: accountUserRole, viewer: accountUserRole },
      }),
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

/** Send a verification message for an account created outside the sign-up endpoint. */
async function sendAccountVerification(email: string): Promise<void> {
  const settings = env();
  const result = await (await auth()).api.sendVerificationEmail({
    body: { email, callbackURL: new URL('/', settings.OPENRIVE_URL).href },
  });
  if (!result.status) throw new Error('Could not send the verification email');
}

// ---------------------------------------------------------------------------
// Accounts, in the shape the rest of OpenRive uses (milliseconds, not dates)

export interface Account extends User {
  email: string | null;
  emailVerified: boolean;
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
  emailVerified: row.emailVerified,
  disabled: row.disabled || row.banned,
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
  if (!account || account.disabled || (emailVerificationRequired() && !account.emailVerified)) return null;
  const organizationId = headers.get('x-openrive-organization-id') || session.session.activeOrganizationId;
  if (!organizationId) return account;
  return accountInOrganization(account, organizationId);
}

/** Resolves a requested workspace from the database; the header itself grants no authority. */
async function accountInOrganization(account: Account, organizationId: string): Promise<Account> {
  const conn = await db();
  const [membership] = await conn
    .select({ role: schema.members.role })
    .from(schema.members)
    .where(and(eq(schema.members.organizationId, organizationId), eq(schema.members.userId, account.id)))
    .limit(1);
  return membership
    ? { ...account, activeOrganizationId: organizationId, activeOrganizationRole: membership.role as Account['activeOrganizationRole'] }
    : account;
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
  if (input.password && emailVerificationRequired() && email) await sendAccountVerification(email);
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
  const requestedEmail = patch.email?.trim().toLowerCase() || null;
  const existingAccount = patch.email !== undefined ? await getAccount(id) : null;
  const emailChanged = patch.email !== undefined && existingAccount?.email !== requestedEmail;
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.email !== undefined) values.email = requestedEmail;
  if (emailChanged && emailVerificationRequired()) values.emailVerified = false;
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.color !== undefined) values.color = patch.color;
  if (patch.disabled !== undefined) values.disabled = patch.disabled;
  if (Object.keys(values).length) {
    values.updatedAt = new Date();
    await conn.transaction(async (tx) => {
      const [before] = await tx.select({ role: schema.users.role, disabled: schema.users.disabled, banned: schema.users.banned })
        .from(schema.users).where(eq(schema.users.id, id)).limit(1);
      const removingAdmin = !!before && isAdministratorRole(before.role) && !before.disabled && !before.banned
        && ((patch.role !== undefined && !isAdministratorRole(patch.role)) || patch.disabled === true);
      if (removingAdmin) {
        // Lock the active-admin set in a stable order so concurrent demotions
        // and disables cannot both remove the final administrators.
        const admins = await tx.select({ id: schema.users.id }).from(schema.users)
          .where(and(eq(schema.users.role, 'admin'), eq(schema.users.disabled, false), eq(schema.users.banned, false)))
          .orderBy(asc(schema.users.id)).for('update');
        const [current] = await tx.select({ role: schema.users.role, disabled: schema.users.disabled, banned: schema.users.banned })
          .from(schema.users).where(eq(schema.users.id, id)).for('update').limit(1);
        const stillRemovingAdmin = !!current && isAdministratorRole(current.role) && !current.disabled && !current.banned
          && ((patch.role !== undefined && !isAdministratorRole(patch.role)) || patch.disabled === true);
        if (stillRemovingAdmin && admins.length <= 1) throw new Error('At least one administrator is required');
      }
      await tx.update(schema.users).set(values).where(eq(schema.users.id, id));
    });
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
  // Credential, address or access changes invalidate every existing session.
  if (patch.password !== undefined || emailChanged || patch.disabled) await revokeUserSessions(id);
  const updated = await getAccount(id);
  if (emailChanged && emailVerificationRequired() && updated?.email && !updated.emailVerified && updated.hasPassword) {
    await sendAccountVerification(updated.email);
  } else if (patch.password !== undefined && emailVerificationRequired() && updated?.email && !updated.emailVerified) {
    await sendAccountVerification(updated.email);
  }
  return updated;
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

/** Transfers owned projects and deletes an account atomically. */
export async function deleteAccountAndTransferProjects(userId: string, heirId?: string) {
  const conn = await db();
  return conn.transaction(async (tx) => {
    const [before] = await tx.select({ role: schema.users.role, disabled: schema.users.disabled, banned: schema.users.banned })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (before && isAdministratorRole(before.role) && !before.disabled && !before.banned) {
      const admins = await tx.select({ id: schema.users.id }).from(schema.users)
        .where(and(eq(schema.users.role, 'admin'), eq(schema.users.disabled, false), eq(schema.users.banned, false)))
        .orderBy(asc(schema.users.id)).for('update');
      const [current] = await tx.select({ role: schema.users.role, disabled: schema.users.disabled, banned: schema.users.banned })
        .from(schema.users).where(eq(schema.users.id, userId)).for('update').limit(1);
      if (current && isAdministratorRole(current.role) && !current.disabled && !current.banned && admins.length <= 1) {
        throw new Error('Cannot delete the last administrator');
      }
    }
    if (heirId) {
      await tx
        .update(schema.projects)
        .set({ ownerId: heirId, updatedAt: Date.now() })
        .where(eq(schema.projects.ownerId, userId));
    } else {
      const [owned] = await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.ownerId, userId)).limit(1);
      if (owned) throw new Error('A remaining user is required to receive the account files');
    }
    const deleted = await tx.delete(schema.users).where(eq(schema.users.id, userId)).returning();
    return deleted.length > 0;
  });
}

/** Housekeeping: drops sessions that expired. */
export async function purgeExpiredSessions() {
  const conn = await db();
  await conn.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}

// ---------------------------------------------------------------------------
// Permissions (enforced on the server, not only in the interface)

export function canSeeProject(user: Account | User, project: ProjectMeta): boolean {
  return canAccessProject(user, project, 'read');
}

export function canEditProject(user: Account | User, project: ProjectMeta): boolean {
  return canAccessProject(user, project, 'edit');
}

/** Sharing, ownership and deletion are more privileged than editing content. */
export function canManageProject(user: Account | User, project: ProjectMeta): boolean {
  return canAccessProject(user, project, 'manage');
}

export function canShareProject(user: Account | User, project: ProjectMeta): boolean {
  return canAccessProject(user, project, 'share');
}

export const canTransferProject = canTransferProjectPermission;
export { canCreateProject };
export const isAdmin = (user: Account | User) => canManageAccounts(user.role);
