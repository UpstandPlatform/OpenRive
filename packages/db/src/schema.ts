// Drizzle schema. PostgreSQL everywhere: a server via DATABASE_URL, or the
// embedded PGlite build of PostgreSQL for a local run with no setup.
import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, customType } from 'drizzle-orm/pg-core';

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
});

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
