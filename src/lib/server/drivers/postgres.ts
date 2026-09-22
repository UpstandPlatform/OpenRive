// PostgreSQL driver (used when DATABASE_URL is set). Tables are created on first use.
import type { Pool } from 'pg';
import type { ProjectMeta, User } from '../../types';
import type { StorageDriver } from './types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS openrive_users (
  id         text PRIMARY KEY,
  position   integer NOT NULL DEFAULT 0,
  data       jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS openrive_projects (
  id         text PRIMARY KEY,
  meta       jsonb NOT NULL,
  doc        text,
  riv        bytea,
  updated_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS openrive_projects_updated ON openrive_projects (updated_at DESC);
CREATE TABLE IF NOT EXISTS openrive_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
`;

export function postgresDriver(connectionString: string): StorageDriver {
  let pool: Pool | null = null;
  let ready: Promise<Pool> | null = null;

  const db = () =>
    (ready ??= (async () => {
      const { Pool } = await import('pg');
      const ssl =
        /[?&]sslmode=(require|verify)/.test(connectionString) || process.env.OPENRIVE_DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
      pool = new Pool({ connectionString, ssl, max: Number(process.env.OPENRIVE_DB_POOL || 10) });
      await pool.query(SCHEMA);
      return pool;
    })().catch((e) => {
      ready = null;
      throw new Error(`Could not connect to PostgreSQL: ${(e as Error).message}`);
    }));

  return {
    name: 'postgres',
    async readUsers() {
      const r = await (await db()).query<{ data: User }>('SELECT data FROM openrive_users ORDER BY position, id');
      return r.rows.map((x) => x.data);
    },
    async writeUsers(users) {
      const client = await (await db()).connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM openrive_users WHERE NOT (id = ANY($1::text[]))', [users.map((u) => u.id)]);
        for (const [i, u] of users.entries()) {
          await client.query(
            'INSERT INTO openrive_users (id, position, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET position = $2, data = $3',
            [u.id, i, JSON.stringify(u)],
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async listMetas() {
      const r = await (await db()).query<{ meta: ProjectMeta }>('SELECT meta FROM openrive_projects ORDER BY updated_at DESC');
      return r.rows.map((x) => x.meta);
    },
    async readMeta(id) {
      const r = await (await db()).query<{ meta: ProjectMeta }>('SELECT meta FROM openrive_projects WHERE id = $1', [id]);
      return r.rows[0]?.meta ?? null;
    },
    async readDoc(id) {
      const r = await (await db()).query<{ doc: string | null }>('SELECT doc FROM openrive_projects WHERE id = $1', [id]);
      return r.rows[0]?.doc ?? null;
    },
    async readRiv(id) {
      const r = await (await db()).query<{ riv: Buffer | null }>('SELECT riv FROM openrive_projects WHERE id = $1', [id]);
      const b = r.rows[0]?.riv;
      return b ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : null;
    },
    async writeProject(meta, { doc, riv }) {
      await (await db()).query(
        `INSERT INTO openrive_projects (id, meta, doc, riv, updated_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET meta = $2, updated_at = $5,
           doc = CASE WHEN $6::boolean THEN $3 ELSE openrive_projects.doc END,
           riv = CASE WHEN $7::boolean THEN $4 ELSE openrive_projects.riv END`,
        [meta.id, JSON.stringify(meta), doc ?? null, riv ? Buffer.from(riv) : null, meta.updatedAt, doc !== undefined, riv !== undefined],
      );
    },
    async deleteProject(id) {
      await (await db()).query('DELETE FROM openrive_projects WHERE id = $1', [id]);
    },
    async claimFirstRun() {
      const p = await db();
      const r = await p.query(`INSERT INTO openrive_settings (key, value) VALUES ('seeded', to_jsonb(now()::text)) ON CONFLICT DO NOTHING`);
      if (!r.rowCount) return false;
      const c = await p.query('SELECT 1 FROM openrive_projects LIMIT 1');
      return c.rowCount === 0;
    },
    async close() {
      await pool?.end();
      pool = null;
      ready = null;
    },
  };
}
