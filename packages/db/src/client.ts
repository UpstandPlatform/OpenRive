// Database connection. With DATABASE_URL it connects to PostgreSQL; without one
// it starts PGlite, the embedded PostgreSQL build, inside OPENRIVE_DATA_DIR — so
// `bun dev` needs no database server, and self-hosting uses a real one.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { dataDir as resolveDataDir, env } from '@openrive/shared/env';
import { sql } from 'drizzle-orm';
import { applyMigrations } from './migrate';
import * as schema from './schema';

export type Db = Awaited<ReturnType<typeof connect>>['db'];

export type Backend = 'postgres' | 'embedded';

let connection: Promise<{ db: Db; backend: Backend; close: () => Promise<void>; where: string }> | null = null;

async function connect() {
  const { DATABASE_URL, OPENRIVE_DB_SSL, OPENRIVE_DB_POOL } = env();
  if (DATABASE_URL) {
    const [{ drizzle }, pg] = await Promise.all([import('drizzle-orm/node-postgres'), import('pg')]);
    const ssl = OPENRIVE_DB_SSL || /[?&]sslmode=(require|verify)/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined;
    const pool = new pg.default.Pool({ connectionString: DATABASE_URL, ssl, max: OPENRIVE_DB_POOL });
    const db = drizzle(pool, { schema });
    await applyMigrations(db);
    return {
      db,
      backend: 'postgres' as const,
      where: DATABASE_URL.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:***@'),
      close: () => pool.end(),
    };
  }
  const dataDir = resolveDataDir();
  const [{ PGlite }, { drizzle }] = await Promise.all([import('@electric-sql/pglite'), import('drizzle-orm/pglite')]);
  const pgdata = path.join(dataDir, 'pgdata');
  mkdirSync(pgdata, { recursive: true }); // PGlite does not create parent folders
  const client = new PGlite(pgdata);
  const db = drizzle(client, { schema });
  await applyMigrations(db);
  return {
    db,
    backend: 'embedded' as const,
    where: path.join(dataDir, 'pgdata'),
    close: () => client.close(),
  };
}

/** The shared connection; the first call creates it and applies migrations. */
export function database() {
  return (connection ??= connect().catch((e) => {
    connection = null;
    throw new Error(`Could not open the database: ${(e as Error).message}`);
  }));
}

export async function db(): Promise<Db> {
  return (await database()).db;
}

export async function closeDatabase() {
  if (!connection) return;
  const current = await connection.catch(() => null);
  connection = null;
  await current?.close();
}

/** Backend name and location, for `openrive storage` and /api/health. */
export async function describeDatabase() {
  const { backend, where, db } = await database();
  await db.execute(sql`select 1`);
  return { backend, where };
}

export { schema };
