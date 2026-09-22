// Applies the embedded migrations. Bookkeeping matches drizzle-kit's own
// migrator (schema "drizzle", table "__drizzle_migrations", sha256 of the file),
// so migrations applied either way are never applied twice.
import { sql } from 'drizzle-orm';
import { migrations } from './migrations.generated';

interface Runner {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
  all?: unknown;
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
  const rows = (await db.execute(sql`SELECT hash FROM "drizzle"."__drizzle_migrations"`)) as { rows?: { hash: string }[] } | { hash: string }[];
  for (const row of Array.isArray(rows) ? rows : (rows.rows ?? [])) applied.add(row.hash);

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.hash)) continue;
    for (const statement of migration.statements) await db.execute(sql.raw(statement));
    await db.execute(sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${migration.hash}, ${Date.now()})`);
    ran.push(migration.tag);
  }
  return ran;
}
