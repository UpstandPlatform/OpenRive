// Filesystem driver: data/users.json and data/projects/<id>/{meta.json,doc.json,file.riv}
import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import type { ProjectMeta, User } from '../../types';
import type { StorageDriver } from './types';

export function fileDriver(dataDir: () => string): StorageDriver {
  const usersFile = () => path.join(dataDir(), 'users.json');
  const projectsDir = () => path.join(dataDir(), 'projects');
  const projectDir = (id: string) => path.join(projectsDir(), id);

  const ensureDirs = () => fs.mkdir(projectsDir(), { recursive: true });

  async function readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  async function writeAtomic(file: string, data: string | Uint8Array) {
    const tmp = `${file}.${nanoid(6)}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  }

  return {
    name: 'file',
    async readUsers() {
      await ensureDirs();
      return readJson<User[]>(usersFile(), []);
    },
    async writeUsers(users) {
      await ensureDirs();
      await writeAtomic(usersFile(), JSON.stringify(users, null, 2));
    },
    async listMetas() {
      await ensureDirs();
      const entries = await fs.readdir(projectsDir(), { withFileTypes: true });
      const metas = await Promise.all(
        entries.filter((e) => e.isDirectory()).map((e) => readJson<ProjectMeta | null>(path.join(projectsDir(), e.name, 'meta.json'), null)),
      );
      return metas.filter((m): m is ProjectMeta => !!m);
    },
    readMeta: (id) => readJson<ProjectMeta | null>(path.join(projectDir(id), 'meta.json'), null),
    async readDoc(id) {
      try {
        return await fs.readFile(path.join(projectDir(id), 'doc.json'), 'utf8');
      } catch {
        return null;
      }
    },
    async readRiv(id) {
      try {
        return new Uint8Array(await fs.readFile(path.join(projectDir(id), 'file.riv')));
      } catch {
        return null;
      }
    },
    async writeProject(meta, { doc, riv }) {
      const dir = projectDir(meta.id);
      await fs.mkdir(dir, { recursive: true });
      if (doc !== undefined) await writeAtomic(path.join(dir, 'doc.json'), doc);
      if (riv !== undefined) await writeAtomic(path.join(dir, 'file.riv'), riv);
      // meta last: a folder without meta.json is not listed
      await writeAtomic(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    },
    async deleteProject(id) {
      await fs.rm(projectDir(id), { recursive: true, force: true });
    },
    async claimFirstRun() {
      await ensureDirs();
      try {
        await fs.writeFile(path.join(dataDir(), '.seeded'), new Date().toISOString(), { flag: 'wx' });
      } catch {
        return false;
      }
      return (await fs.readdir(projectsDir())).length === 0;
    },
  };
}
