import { deleteAccountAndTransferProjects, getAccount, listAccounts, revokeUserSessions, updateAccount } from '@openrive/auth';
import { listProjects } from '@openrive/db';
import { adminUpdateUserSchema } from '@openrive/shared';
import { requireAdmin } from '@/lib/server/auth';
import { routeId } from '@/lib/server/route';
import { body, fail, handler, json, notFound } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const PATCH = handler(async (request: Request, ctx: RouteContext<'/api/admin/users/[id]'>) => {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const parsed = await body(request, adminUpdateUserSchema);
  if (parsed.error) return parsed.error;

  const accounts = await listAccounts();
  const target = accounts.find((a) => a.id === id);
  if (!target) return notFound();
  const admins = accounts.filter((a) => a.role === 'admin' && !a.disabled);
  const losingLastAdmin = target.role === 'admin' && admins.length === 1 && (parsed.data.role === 'editor' || parsed.data.role === 'viewer' || parsed.data.disabled);
  if (losingLastAdmin) return fail('At least one administrator is required');

  try {
    const account = await updateAccount(id, {
      ...parsed.data,
      email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
      password: parsed.data.password || undefined,
    });
    return account ? json(account) : notFound();
  } catch (e) {
    return fail((e as Error).message);
  }
});

export const DELETE = handler(async (request: Request, ctx: RouteContext<'/api/admin/users/[id]'>) => {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const accounts = await listAccounts();
  const target = accounts.find((a) => a.id === id);
  if (!target) return notFound();
  const activeAdmins = accounts.filter((a) => a.role === 'admin' && !a.disabled);
  if (target.role === 'admin' && !target.disabled && activeAdmins.length === 1) {
    return fail('Cannot delete the last administrator');
  }

  // the removed account's files move to another user, so nothing is orphaned
  const transferTo = new URL(request.url).searchParams.get('transferTo');
  const heir = accounts.find((a) => a.id === transferTo && a.id !== id && !a.disabled) ?? activeAdmins.find((a) => a.id !== id);
  const hasOwnedProjects = (await listProjects()).some((project) => project.ownerId === id);
  if (hasOwnedProjects && !heir) return fail('An active user is required to receive the account files', 409);
  await revokeUserSessions(id);
  const deleted = await deleteAccountAndTransferProjects(id, heir?.id);
  if (!deleted) return notFound();
  return json({ ok: true, transferredTo: heir?.id ?? null });
});

export const GET = handler(async (_request: Request, ctx: RouteContext<'/api/admin/users/[id]'>) => {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const account = await getAccount(id);
  return account ? json(account) : notFound();
});
