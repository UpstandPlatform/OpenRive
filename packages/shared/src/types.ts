// Domain types. Every shape is a zod schema first, and the TypeScript types are
// inferred from it, so the API, the database layer and the CLI validate the same way.
import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'editor', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color'),
  role: roleSchema,
  createdAt: z.number().int().nonnegative(),
});
export type User = z.infer<typeof userSchema>;

export const projectMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ownerId: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  /** small PNG data URL */
  thumbnail: z.string().optional(),
  artboards: z.number().int().nonnegative().optional(),
  animations: z.number().int().nonnegative().optional(),
  stateMachines: z.number().int().nonnegative().optional(),
  sharedWith: z.array(z.string()).optional(),
});
export type ProjectMeta = z.infer<typeof projectMetaSchema>;

/** Ids come from URLs and command line arguments, so they are always validated. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

export const USER_COLORS = ['#7c5cff', '#2bb3ff', '#27c498', '#ffb020', '#ff5c7a', '#ff7a2b', '#b45cff', '#5ce1ff'] as const;

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  admin: { label: 'Admin', description: 'Full access. Can manage users and every file.' },
  editor: { label: 'Editor', description: 'Can create files and edit their own and shared files.' },
  viewer: { label: 'Viewer', description: 'Read-only. Can open and preview files, but not change them.' },
};
