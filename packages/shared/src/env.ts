// Environment configuration, validated once with zod. Importing this module
// anywhere gives the same checked values, and a bad value fails loudly at startup.
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  /** Explicit product edition. When omitted, local is inferred without PostgreSQL and self_hosted with it. */
  OPENRIVE_EDITION: z.enum(['local', 'self_hosted', 'cloud']).optional(),
  /** PostgreSQL connection string. Without it an embedded PostgreSQL (PGlite) runs from OPENRIVE_DATA_DIR. */
  DATABASE_URL: z.string().url().optional(),
  /** Folder for the embedded database and for CLI imports/exports. */
  OPENRIVE_DATA_DIR: z.string().default('./data'),
  /** When set, every HTTP request needs this password (HTTP Basic auth, any user name). */
  OPENRIVE_ACCESS_TOKEN: z.string().min(1).optional(),
  /** Server the CLI and MCP tools talk to. */
  OPENRIVE_URL: z.string().url().default('http://localhost:3000'),
  /** Default owner (user id or name) for files created by the CLI and MCP tools. */
  OPENRIVE_USER: z.string().optional(),
  OPENRIVE_DB_SSL: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  OPENRIVE_DB_POOL: z.coerce.number().int().positive().max(100).default(10),
  /** how long to wait for a PostgreSQL server that is still starting */
  OPENRIVE_DB_WAIT_SECONDS: z.coerce.number().int().nonnegative().max(600).default(60),
  /** Redis for distributed rate limits, locks and other ephemeral coordination. */
  OPENRIVE_REDIS_URL: z.string().url().optional(),
  /** S3-compatible object storage used by the cloud edition for project files. */
  OPENRIVE_STORAGE_ENDPOINT: z.string().url().optional(),
  OPENRIVE_STORAGE_REGION: z.string().trim().min(1).default('us-east-1'),
  OPENRIVE_STORAGE_BUCKET: z.string().trim().min(1).optional(),
  OPENRIVE_STORAGE_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  OPENRIVE_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  OPENRIVE_STORAGE_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** 'auto' requires sign-in when DATABASE_URL is set (a shared deployment) */
  OPENRIVE_AUTH: z.enum(['auto', 'on', 'off']).default('auto'),
  /** how long a sign-in lasts */
  OPENRIVE_SESSION_DAYS: z.coerce.number().int().positive().max(365).default(30),
  /** signs session cookies; generated and kept in the database when unset */
  OPENRIVE_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  /** comma-separated origins allowed to call the authentication endpoints */
  OPENRIVE_TRUSTED_ORIGINS: z.string().optional(),
  /** who may use the sign-up page: anyone, only the first (administrator) account, or nobody */
  OPENRIVE_SIGNUP: z.enum(['open', 'first', 'off']).default('first'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Edition = 'local' | 'self_hosted' | 'cloud';
export type Env = Omit<z.infer<typeof envSchema>, 'OPENRIVE_EDITION'> & { OPENRIVE_EDITION: Edition };

function read(): Env {
  const source: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env;
  const optional = (value: string | undefined) => (value?.trim() ? value : undefined);
  const parsed = envSchema.safeParse({
    ...source,
    // legacy names from before the project was renamed to OpenRive
    DATABASE_URL: source.DATABASE_URL || source.OPENRIVE_DATABASE_URL || undefined,
    OPENRIVE_DATA_DIR: source.OPENRIVE_DATA_DIR || source.RIVE_EDITOR_DATA_DIR || undefined,
    OPENRIVE_ACCESS_TOKEN: optional(source.OPENRIVE_ACCESS_TOKEN || source.RIVE_EDITOR_ACCESS_TOKEN),
    OPENRIVE_AUTH_SECRET: optional(source.OPENRIVE_AUTH_SECRET),
    OPENRIVE_TRUSTED_ORIGINS: optional(source.OPENRIVE_TRUSTED_ORIGINS),
    OPENRIVE_REDIS_URL: optional(source.OPENRIVE_REDIS_URL),
    OPENRIVE_STORAGE_ENDPOINT: optional(source.OPENRIVE_STORAGE_ENDPOINT),
    OPENRIVE_STORAGE_BUCKET: optional(source.OPENRIVE_STORAGE_BUCKET),
    OPENRIVE_STORAGE_ACCESS_KEY_ID: optional(source.OPENRIVE_STORAGE_ACCESS_KEY_ID),
    OPENRIVE_STORAGE_SECRET_ACCESS_KEY: optional(source.OPENRIVE_STORAGE_SECRET_ACCESS_KEY),
    OPENRIVE_USER: source.OPENRIVE_USER || source.RIVE_EDITOR_USER || undefined,
  });
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  const data = parsed.data;
  const edition = data.OPENRIVE_EDITION ?? (data.DATABASE_URL ? 'self_hosted' : 'local');
  const errors: string[] = [];

  if (edition === 'cloud') {
    if (!data.DATABASE_URL) errors.push('DATABASE_URL is required for the cloud edition');
    if (!data.OPENRIVE_REDIS_URL) errors.push('OPENRIVE_REDIS_URL is required for the cloud edition');
    if (!data.OPENRIVE_AUTH_SECRET) errors.push('OPENRIVE_AUTH_SECRET is required for the cloud edition');
    if (data.OPENRIVE_AUTH === 'off') errors.push('OPENRIVE_AUTH=off is not allowed for the cloud edition');
    if (!data.OPENRIVE_STORAGE_ENDPOINT) errors.push('OPENRIVE_STORAGE_ENDPOINT is required for the cloud edition');
    if (!data.OPENRIVE_STORAGE_BUCKET) errors.push('OPENRIVE_STORAGE_BUCKET is required for the cloud edition');
    if (!data.OPENRIVE_STORAGE_ACCESS_KEY_ID) errors.push('OPENRIVE_STORAGE_ACCESS_KEY_ID is required for the cloud edition');
    if (!data.OPENRIVE_STORAGE_SECRET_ACCESS_KEY) errors.push('OPENRIVE_STORAGE_SECRET_ACCESS_KEY is required for the cloud edition');
    if (data.NODE_ENV === 'production' && !data.OPENRIVE_URL.startsWith('https://')) {
      errors.push('OPENRIVE_URL must use https:// in cloud production');
    }
  }

  if (errors.length) throw new Error(`Invalid environment configuration:\n${errors.map((error) => `  ${error}`).join('\n')}`);
  return { ...data, OPENRIVE_EDITION: edition };
}

let cached: Env | null = null;

/** Validated environment. Re-read it after changing process.env (the CLI does this for --data / --db). */
export function env(): Env {
  return (cached ??= read());
}

/**
 * Does this deployment require a sign-in? Pure configuration, so the database
 * layer can answer it too (it seeds a local user only when it does not).
 */
export function authRequired(): boolean {
  if (env().OPENRIVE_EDITION === 'cloud') return true;
  const mode = env().OPENRIVE_AUTH;
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  // 'auto': a database server means a shared deployment, which needs accounts
  return !!env().DATABASE_URL;
}

export function resetEnv() {
  cached = null;
  cachedDataDir = null;
}

let cachedDataDir: string | null = null;

/**
 * Absolute data folder. A relative OPENRIVE_DATA_DIR (the `./data` default) is
 * resolved against the workspace root, so the web app, the CLI and the MCP
 * server share one folder no matter which directory they start in.
 */
export function dataDir(): string {
  if (cachedDataDir) return cachedDataDir;
  const configured = env().OPENRIVE_DATA_DIR;
  return (cachedDataDir = isAbsolute(configured) ? configured : resolve(workspaceRoot(), configured));
}

/** Nearest ancestor with a workspace package.json (falls back to the current directory). */
function workspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { workspaces?: unknown };
      if (pkg.workspaces) return dir;
    } catch {
      /* keep walking up */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
