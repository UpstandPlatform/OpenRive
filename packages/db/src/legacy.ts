// Imports the file storage used before OpenRive moved to Drizzle/PostgreSQL:
//   data/users.json and data/projects/<id>/{meta.json,doc.json,file.riv}
// Nothing is deleted: the folder stays as a backup.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { projectMetaSchema, userSchema } from '@openrive/shared';
import { dataDir } from '@openrive/shared/env';
import { db } from './client';
import { projects, users } from './schema';

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function legacyDataDir(dir = dataDir()) {
  const resolved = path.resolve(dir);
  const projectsDir = path.join(resolved, 'projects');
  try {
    await fs.access(projectsDir);
    return { root: resolved, projectsDir };
  } catch {
    return null;
  }
}

/** Copies a legacy data folder into the database. Existing ids are left alone. */
export async function importLegacyDataDir(dir?: string, log: (msg: string) => void = () => {}) {
  const found = await legacyDataDir(dir);
  if (!found) return { users: 0, projects: 0 };
  const conn = await db();

  const legacyUsers = (await readJson<unknown[]>(path.join(found.root, 'users.json'))) ?? [];
  let userCount = 0;
  for (const [position, raw] of legacyUsers.entries()) {
    const parsed = userSchema.safeParse(raw);
    if (!parsed.success) continue;
    await conn.insert(users).values({ ...parsed.data, position }).onConflictDoNothing();
    userCount++;
  }

  let projectCount = 0;
  const entries = await fs.readdir(found.projectsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(found.projectsDir, entry.name);
    const meta = projectMetaSchema.safeParse(await readJson(path.join(dirPath, 'meta.json')));
    if (!meta.success) continue;
    const doc = await fs.readFile(path.join(dirPath, 'doc.json'), 'utf8').catch(() => null);
    const riv = await fs.readFile(path.join(dirPath, 'file.riv')).catch(() => null);
    await conn
      .insert(projects)
      .values({
        ...meta.data,
        thumbnail: meta.data.thumbnail ?? null,
        artboards: meta.data.artboards ?? null,
        animations: meta.data.animations ?? null,
        stateMachines: meta.data.stateMachines ?? null,
        sharedWith: meta.data.sharedWith ?? null,
        doc,
        riv: riv ? new Uint8Array(riv) : null,
      })
      .onConflictDoNothing();
    projectCount++;
    log(`project: ${meta.data.name} (${meta.data.id})`);
  }
  if (userCount || projectCount) log(`imported ${userCount} users and ${projectCount} projects from ${found.root}`);
  return { users: userCount, projects: projectCount };
}
