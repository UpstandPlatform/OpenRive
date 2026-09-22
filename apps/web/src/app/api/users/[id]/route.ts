import { listProjects, listUsers, saveUsers, updateProject } from '@openrive/db';
import { updateUserSchema } from '@openrive/shared';
import { body, fail, handler, json, notFound, routeId } from '@/lib/server/route';

export const PUT = handler(async (request: Request, ctx: RouteContext<'/api/users/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const parsed = await body(request, updateUserSchema);
  if (parsed.error) return parsed.error;
  const users = await listUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return notFound();
  const admins = users.filter((u) => u.role === 'admin').length;
  if (parsed.data.role && parsed.data.role !== 'admin' && user.role === 'admin' && admins === 1) {
    return fail('At least one admin is required');
  }
  Object.assign(user, parsed.data);
  await saveUsers(users);
  return json(user);
});

export const DELETE = handler(async (request: Request, ctx: RouteContext<'/api/users/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const users = await listUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return notFound();
  if (user.role === 'admin' && users.filter((u) => u.role === 'admin').length === 1) return fail('Cannot delete the last admin');
  const remaining = users.filter((u) => u.id !== id);
  const transferTo = new URL(request.url).searchParams.get('transferTo');
  const heir = remaining.find((u) => u.id === transferTo) ?? remaining.find((u) => u.role === 'admin')!;
  // the removed user's files move to another user, so nothing becomes unreachable
  for (const project of await listProjects()) {
    if (project.ownerId === id) await updateProject(project.id, { ownerId: heir.id });
  }
  await saveUsers(remaining);
  return json({ ok: true });
});
