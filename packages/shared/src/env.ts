// Environment configuration, validated once with zod. Importing this module
// anywhere gives the same checked values, and a bad value fails loudly at startup.
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
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
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function read(): Env {
  const source: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env;
  const parsed = envSchema.safeParse({
    ...source,
    // legacy names from before the project was renamed to OpenRive
    DATABASE_URL: source.DATABASE_URL || source.OPENRIVE_DATABASE_URL || undefined,
    OPENRIVE_DATA_DIR: source.OPENRIVE_DATA_DIR || source.RIVE_EDITOR_DATA_DIR || undefined,
    OPENRIVE_ACCESS_TOKEN: source.OPENRIVE_ACCESS_TOKEN || source.RIVE_EDITOR_ACCESS_TOKEN || undefined,
    OPENRIVE_USER: source.OPENRIVE_USER || source.RIVE_EDITOR_USER || undefined,
  });
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  return parsed.data;
}

let cached: Env | null = null;

/** Validated environment. Re-read it after changing process.env (the CLI does this for --data / --db). */
export function env(): Env {
  return (cached ??= read());
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
