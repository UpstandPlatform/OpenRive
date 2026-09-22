// Drizzle schema. PostgreSQL everywhere: a server via DATABASE_URL, or the
// embedded PGlite build of PostgreSQL for a local run with no setup.
import { bigint, integer, jsonb, pgTable, text, customType } from 'drizzle-orm/pg-core';

/** bytea mapped to Uint8Array (the exported .riv file). */
const bytes = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] })
    .notNull()
    .default('editor'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  position: integer('position').notNull().default(0),
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
});

/** Small key/value store: first-run marker, schema housekeeping. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
