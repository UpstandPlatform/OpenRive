// Database connection. With DATABASE_URL it connects to PostgreSQL; without one
// it starts PGlite, the embedded PostgreSQL build, inside OPENRIVE_DATA_DIR — so
// `bun dev` needs no database server, and self-hosting uses a real one.
import { closeSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { dataDir as resolveDataDir, env } from '@openrive/shared/env';
import { sql } from 'drizzle-orm';
import { applyMigrations } from './migrate';
import * as schema from './schema';

export type Db = Awaited<ReturnType<typeof connect>>['db'];

export type Backend = 'postgres' | 'embedded';

type Connection = { db: Db; backend: Backend; close: () => Promise<void>; where: string };
type ConnectionRegistry = { connection: Promise<Connection> | null };
const connectionKey = Symbol.for('@openrive/db/connection');
const globalWithRegistry = globalThis as typeof globalThis & { [key: symbol]: ConnectionRegistry | undefined };
// Next can load this workspace package into more than one route module in the
// same server process. Share one connection and its file lock across bundles.
const connectionRegistry = (globalWithRegistry[connectionKey] ??= { connection: null });

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
    const migrationClient = await pool.connect();
    try {
      await applyMigrations(drizzle(migrationClient, { schema }), { lock: true });
    } finally {
      migrationClient.release();
    }
    return {
      db,
      backend: 'postgres' as const,
      where: DATABASE_URL.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:***@'),
      close: () => pool.end(),
    };
  }
  const dataDir = resolveDataDir();
  const [{ PGlite }, { drizzle }] = await Promise.all([import('@electric-sql/pglite'), import('drizzle-orm/pglite')]);
  const configuredPgdata = path.join(dataDir, 'pgdata');
  mkdirSync(configuredPgdata, { recursive: true }); // PGlite does not create parent folders
  // Normalize symlink/junction aliases so the same physical folder has one
  // lock path regardless of how the process reached it.
  const canonicalDataDir = realpathSync(dataDir);
  const pgdata = path.join(canonicalDataDir, 'pgdata');
  const unlock = await lockDataDir(canonicalDataDir);
  try {
    const client = new PGlite(pgdata);
    const db = drizzle(client, { schema });
    await applyMigrations(db);
    return {
      db,
      backend: 'embedded' as const,
      where: path.join(dataDir, 'pgdata'),
      close: async () => {
        try {
          await client.close();
        } finally {
          unlock();
        }
      },
    };
  } catch (e) {
    unlock();
    throw e;
  }
}

/**
 * PGlite is single-process: it reads the data folder into memory at start and
 * writes it back on its own schedule, so a second process (the editor server,
 * the CLI and the stdio MCP server all open it) works on a stale copy and the
 * last writer silently wins. An exclusive lock file turns that into an error.
 */
async function lockDataDir(dataDir: string): Promise<() => void> {
  const file = path.join(dataDir, 'pgdata.lock');
  while (true) {
    try {
      const fd = openSync(file, 'wx');
      const token = `${process.pid}:${randomUUID()}`;
      try {
        writeSync(fd, token);
      } catch (e) {
        closeSync(fd);
        rmSync(file, { force: true });
        throw e;
      }
      closeSync(fd);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        process.off('exit', release);
        try {
          if (readFileSync(file, 'utf8') === token) rmSync(file);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
      };
      process.on('exit', release);
      return release;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      let contents: string;
      try {
        contents = readFileSync(file, 'utf8');
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw readError;
      }
      const match = /^(\d+)(?::[a-f0-9-]+)?$/i.exec(contents.trim());
      const holder = match ? Number(match[1]) : 0;
      if (Number.isSafeInteger(holder) && holder > 0 && isAlive(holder)) {
        throw new Error(
          `the embedded database in ${dataDir} is in use by process ${holder} (for example \`openrive serve\` or the MCP server). ` +
            'Only one process can open it: use the editor-backed MCP bridge, stop the other process, or set DATABASE_URL to share PostgreSQL.',
        );
      }
      if (!match || !Number.isSafeInteger(holder) || holder < 1) {
        let age = 0;
        try {
          age = Date.now() - statSync(file).mtimeMs;
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw statError;
        }
        // Another process creates the file before writing its PID. Give that
        // short initialization window time to complete before treating it as
        // an orphan left by a crashed process.
        if (age < 1000) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }
      }
      try {
        if (readFileSync(file, 'utf8') === contents) rmSync(file);
      } catch (removeError) {
        if ((removeError as NodeJS.ErrnoException).code !== 'ENOENT') throw removeError;
      }
    }
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === 'EPERM' || code === 'EACCES';
  }
}

/** The shared connection; the first call creates it and applies migrations. */
export function database() {
  return (connectionRegistry.connection ??= connect().catch((e) => {
    connectionRegistry.connection = null;
    throw new Error(`Could not open the database: ${(e as Error).message}`);
  }));
}

export async function db(): Promise<Db> {
  return (await database()).db;
}

export async function closeDatabase() {
  if (!connectionRegistry.connection) return;
  const current = await connectionRegistry.connection.catch(() => null);
  connectionRegistry.connection = null;
  await current?.close();
}

/** Backend name and location, for `openrive storage` and /api/health. */
export async function describeDatabase() {
  const { backend, where, db } = await database();
  await db.execute(sql`select 1`);
  return { backend, where };
}

export { schema };
