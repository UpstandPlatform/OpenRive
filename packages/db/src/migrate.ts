// Applies the embedded migrations. Bookkeeping matches drizzle-kit's own
// migrator (schema "drizzle", table "__drizzle_migrations", sha256 of the file),
// so migrations applied either way are never applied twice.
import { sql } from 'drizzle-orm';
import { migrations } from './migrations.generated';

interface Runner {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
  all?: unknown;
}

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const value = (result as { rows?: unknown }).rows;
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

async function baselineExistingSchema(db: Runner, applied: Set<string>) {
  const tables = new Set(
    rows<{ table_name: string }>(
      await db.execute(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `),
    ).map((row) => row.table_name),
  );
  const columns = new Set(
    rows<{ table_name: string; column_name: string }>(
      await db.execute(sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `),
    ).map((row) => `${row.table_name}.${row.column_name}`),
  );
  const has = (table: string, column?: string) => tables.has(table) && (!column || columns.has(`${table}.${column}`));
  const baseline = new Set<string>();

  // Older self-hosted PostgreSQL installations created the tables before the
  // embedded migration journal was introduced. Record the migrations that
  // their schema already represents, then let normal migrations continue.
  if (has('projects') && has('settings') && has('users')) baseline.add('0000_plain_komodo');
  if (has('sessions') && has('users', 'email') && has('users', 'password_hash')) baseline.add('0001_odd_felicia_hardy');
  if (has('accounts') && has('verifications') && has('sessions', 'token') && has('users', 'email_verified')) {
    // A schema that has reached Better Auth necessarily includes the prior
    // migrations, even though the password_hash column was removed by 0002.
    baseline.add('0000_plain_komodo');
    baseline.add('0001_odd_felicia_hardy');
    baseline.add('0002_better_auth');
  }
  if (has('rate_limit')) baseline.add('0003_cute_starbolt');

  for (const migration of migrations) {
    if (!baseline.has(migration.tag) || applied.has(migration.hash)) continue;
    await db.execute(sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${migration.hash}, ${Date.now()})`);
    applied.add(migration.hash);
  }
}

export async function applyMigrations(db: Runner): Promise<string[]> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  const applied = new Set<string>();
  const migrationRows = (await db.execute(sql`SELECT hash FROM "drizzle"."__drizzle_migrations"`)) as { rows?: { hash: string }[] } | { hash: string }[];
  for (const row of (Array.isArray(migrationRows) ? migrationRows : (migrationRows.rows ?? []))) applied.add(row.hash);
  // Run this even when the journal is non-empty: a previous interrupted or
  // manually initialized deployment can leave partial bookkeeping behind.
  await baselineExistingSchema(db, applied);

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.hash)) continue;
    for (const statement of migration.statements) await db.execute(sql.raw(statement));
    await db.execute(sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${migration.hash}, ${Date.now()})`);
    ran.push(migration.tag);
  }
  return ran;
}
