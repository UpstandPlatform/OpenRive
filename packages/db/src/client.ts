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

/**
 * Errors that mean "the server is still starting", worth waiting out. Drivers
 * wrap the original error, so the whole cause chain is checked.
 */
function isStarting(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; current = (current as { cause?: unknown }).cause, depth++) {
    const code = String((current as { code?: string }).code ?? '');
    const message = String((current as Error).message ?? '');
    if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', '57P03'].includes(code)) return true;
    if (/starting up|not yet accepting|connection refused|getaddrinfo|ECONNREFUSED/i.test(message)) return true;
  }
  return false;
}

async function connect() {
  const { DATABASE_URL, OPENRIVE_DB_SSL, OPENRIVE_DB_SSL_CA, OPENRIVE_ALLOW_INSECURE_INTERNAL_SERVICES, OPENRIVE_DB_POOL, OPENRIVE_DB_WAIT_SECONDS } = env();
  if (DATABASE_URL) {
    const [{ drizzle }, pg] = await Promise.all([import('drizzle-orm/node-postgres'), import('pg')]);
    const sslRequested = OPENRIVE_DB_SSL || /[?&]sslmode=(require|verify(?:-ca|-full)?)/.test(DATABASE_URL);
    const ssl = sslRequested
      ? {
          // Certificate verification is the secure default. Private CAs must
          // be supplied explicitly instead of silently accepting any cert.
          rejectUnauthorized: !OPENRIVE_ALLOW_INSECURE_INTERNAL_SERVICES,
          ...(OPENRIVE_DB_SSL_CA ? { ca: OPENRIVE_DB_SSL_CA } : {}),
        }
      : undefined;
    const pool = new pg.default.Pool({ connectionString: DATABASE_URL, ssl, max: OPENRIVE_DB_POOL });
    const db = drizzle(pool, { schema });
    // compose starts the app beside PostgreSQL, so the first connection often
    // lands before it accepts any: wait it out instead of failing the request
    const deadline = Date.now() + OPENRIVE_DB_WAIT_SECONDS * 1000;
    for (let attempt = 1; ; attempt++) {
      try {
        // the pool reports connection errors unwrapped, with their code
        await pool.query('select 1');
        break;
      } catch (e) {
        if (!isStarting(e) || Date.now() >= deadline) {
          await pool.end().catch(() => {});
          throw e;
        }
        if (attempt === 1) console.log('[db] waiting for PostgreSQL to accept connections…');
        await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 250 * attempt)));
      }
    }
    await applyMigrations(db, { lock: true });
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
