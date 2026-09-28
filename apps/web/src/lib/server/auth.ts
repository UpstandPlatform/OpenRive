// Server-side access control. Every API route goes through these helpers, so
// roles are enforced on the server and not only hidden in the interface.
import {
  auth,
  authEnabled,
  canEditProject,
  canManageProject,
  canSeeProject,
  canTransferProject,
  isAdmin,
  sessionUser,
  SESSION_COOKIE,
  type Account,
} from '@openrive/auth';
import { listUsers } from '@openrive/db';
import type { ProjectMeta } from '@openrive/shared';
import { headers } from 'next/headers';
import { fail } from './route';

export { auth, authEnabled, canEditProject, canManageProject, canSeeProject, canTransferProject, isAdmin, SESSION_COOKIE };
export type { Account };

/**
 * Who is making this request.
 *
 * With authentication on, that is the signed-in account. With it off (the
 * local, login-free default) the request acts as the first admin, so a single
 * user keeps working without signing in.
 */
export async function currentUser(): Promise<Account | null> {
  if (authEnabled()) return sessionUser(await headers());
  const users = await listUsers();
  const local = users.find((u) => u.role === 'admin') ?? users[0];
  return local ? { ...local, email: null, disabled: false, lastLoginAt: null, hasPassword: false } : null;
}

export type Guard<T> = { user: Account; error?: never } | { user?: never; error: Response } | T;

/** Requires a signed-in account. */
export async function requireUser(): Promise<{ user: Account; error?: never } | { user?: never; error: Response }> {
  const user = await currentUser();
  if (!user) return { error: fail('Sign in to continue', 401) };
  return { user };
}

/** Requires an administrator. */
export async function requireAdmin(): Promise<{ user: Account; error?: never } | { user?: never; error: Response }> {
  const result = await requireUser();
  if (result.error) return result;
  if (!isAdmin(result.user)) return { error: fail('Administrators only', 403) };
  return result;
}

/** Requires permission to change a project. */
export function requireEdit(user: Account, project: ProjectMeta): Response | null {
  if (!canEditProject(user, project)) return fail('You cannot edit this file', 403);
  return null;
}

export function requireProjectManager(user: Account, project: ProjectMeta): Response | null {
  if (!canManageProject(user, project)) return fail('Only the owner or an administrator may manage this file', 403);
  return null;
}

