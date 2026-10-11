// Drizzle schema. PostgreSQL everywhere: a server via DATABASE_URL, or the
// embedded PGlite build of PostgreSQL for a local run with no setup.
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, customType, uniqueIndex } from 'drizzle-orm/pg-core';

/** bytea mapped to Uint8Array (the exported .riv file). */
const bytes = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
});

// ---------------------------------------------------------------------------
// Accounts
//
// users, sessions, accounts and verifications are Better Auth's four models, so
// the property names below are the ones it looks for — renaming one breaks
// sign-in. OpenRive's own columns (color, role, position) live on users beside
// them and are declared to Better Auth as additional fields.
//
// Without a sign-in (the local default) the same users table holds the people a
// file can be attributed to: those rows simply have no email and no account.

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** sign-in address; null for a local user, who never signs in */
  email: text('email').unique(),
  /** never checked: self-hosted OpenRive sends no mail */
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  color: text('color').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] })
    .notNull()
    .default('editor'),
  position: integer('position').notNull().default(0),
  /** a disabled account keeps its files but cannot sign in */
  disabled: boolean('disabled').notNull().default(false),
  /** Better Auth admin plugin ban state; kept separate from legacy manual disable. */
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

/** Signed-in sessions. Rows are the source of truth, so they can be revoked. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  /** short description of the browser, shown in the admin dashboard */
  userAgent: text('user_agent'),
  activeOrganizationId: text('active_organization_id'),
  impersonatedBy: text('impersonated_by'),
});

/** Better Auth organization plugin tables. */
export const organizations = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const members = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('member_organization_user_unique').on(table.organizationId, table.userId),
  index('member_user_id_idx').on(table.userId),
]);

export const invitations = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (table) => [
  index('invitation_organization_id_idx').on(table.organizationId),
  index('invitation_email_idx').on(table.email),
]);

/** How an account signs in. OpenRive only creates 'credential' rows (a password). */
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Short-lived tokens (a password reset). Empty while nothing has asked for one. */
export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Persistent Better Auth rate-limit windows for multi-process deployments. */
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

/** Better Auth API-key plugin storage, used by remote MCP clients. */
export const apiKeys = pgTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    configId: text('config_id').notNull().default('mcp'),
    name: text('name'),
    start: text('start'),
    referenceId: text('reference_id').notNull(),
    prefix: text('prefix'),
    key: text('key').notNull(),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
    enabled: boolean('enabled').notNull().default(true),
    rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(true),
    rateLimitTimeWindow: integer('rate_limit_time_window').notNull().default(86_400_000),
    rateLimitMax: integer('rate_limit_max').notNull().default(10),
    requestCount: integer('request_count').notNull().default(0),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_request', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [index('apikey_reference_id_idx').on(table.referenceId), index('apikey_key_idx').on(table.key)],
);

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().default(''),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  /** small PNG data URL shown on the files page */
  thumbnail: text('thumbnail'),
  artboards: integer('artboards'),
  animations: integer('animations'),
  stateMachines: integer('state_machines'),
  sharedWith: jsonb('shared_with').$type<string[]>(),
  /** Workspace projects are visible to members of this organization only. */
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  /** editor document (JSON with base64 byte fields) */
  doc: text('doc'),
  /** exported Rive file */
  riv: bytes('riv'),
  /** object-storage key used by cloud deployments; null means the file is in riv */
  rivStorageKey: text('riv_storage_key'),
});

/** Small key/value store: first-run marker, schema housekeeping. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type RateLimitRow = typeof rateLimit.$inferSelect;
