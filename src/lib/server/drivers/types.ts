import type { ProjectMeta, User } from '../../types';

/** A storage backend. The file driver is the default; Postgres is used when DATABASE_URL is set. */
export interface StorageDriver {
  readonly name: 'file' | 'postgres';
  /** users in list order (empty when none exist yet) */
  readUsers(): Promise<User[]>;
  /** replaces the whole user list */
  writeUsers(users: User[]): Promise<void>;
  listMetas(): Promise<ProjectMeta[]>;
  readMeta(id: string): Promise<ProjectMeta | null>;
  readDoc(id: string): Promise<string | null>;
  readRiv(id: string): Promise<Uint8Array | null>;
  /** creates or updates a project; doc/riv are only written when given */
  writeProject(meta: ProjectMeta, data: { doc?: string; riv?: Uint8Array }): Promise<void>;
  deleteProject(id: string): Promise<void>;
  /** true only the first time it's called for an empty data store (seeds the welcome project) */
  claimFirstRun(): Promise<boolean>;
  close?(): Promise<void>;
}
