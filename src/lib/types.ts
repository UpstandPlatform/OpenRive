export type Role = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  name: string;
  color: string;
  role: Role;
  createdAt: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  /** small PNG data URL */
  thumbnail?: string;
  artboards?: number;
  animations?: number;
  stateMachines?: number;
  sharedWith?: string[];
}

export const USER_COLORS = ['#7c5cff', '#2bb3ff', '#27c498', '#ffb020', '#ff5c7a', '#ff7a2b', '#b45cff', '#5ce1ff'];

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  admin: { label: 'Admin', description: 'Full access. Can manage users and every file.' },
  editor: { label: 'Editor', description: 'Can create files and edit their own and shared files.' },
  viewer: { label: 'Viewer', description: 'Read-only. Can open and preview files, but not change them.' },
};
