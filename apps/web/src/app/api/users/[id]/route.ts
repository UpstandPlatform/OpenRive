import { deleteLocalUserAndTransferProjects, listUsers, updateLocalUser } from '@openrive/db';
import { updateUserSchema } from '@openrive/shared';
import { body, fail, handler, json, notFound, routeId } from '@/lib/server/route';
import { authEnabled, requireAdmin } from '@/lib/server/auth';

export const PUT = handler(async (request: Request, ctx: RouteContext<'/api/users/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = authEnabled() ? await requireAdmin() : { error: undefined };
  if (guard.error) return guard.error;
  const parsed = await body(request, updateUserSchema);
  if (parsed.error) return parsed.error;
  const users = await listUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return notFound();
  const admins = users.filter((u) => u.role === 'admin').length;
  if (parsed.data.role && parsed.data.role !== 'admin' && user.role === 'admin' && admins === 1) {
    return fail('At least one admin is required');
  }
  try {
    const updated = await updateLocalUser(id, parsed.data);
    return updated ? json(updated) : notFound();
  } catch (e) {
    return fail((e as Error).message);
  }
});

export const DELETE = handler(async (request: Request, ctx: RouteContext<'/api/users/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = authEnabled() ? await requireAdmin() : { error: undefined };
  if (guard.error) return guard.error;
  const users = await listUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return notFound();
  if (user.role === 'admin' && users.filter((u) => u.role === 'admin').length === 1) return fail('Cannot delete the last admin');
  const remaining = users.filter((u) => u.id !== id);
  const transferTo = new URL(request.url).searchParams.get('transferTo');
  const heir = remaining.find((u) => u.id === transferTo) ?? remaining.find((u) => u.role === 'admin')!;
  if (!heir) return fail('A remaining user is required to receive the files', 409);
  const deleted = await deleteLocalUserAndTransferProjects(id, heir.id);
  if (!deleted) return notFound();
  return json({ ok: true });
});
