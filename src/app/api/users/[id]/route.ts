import { listProjects, listUsers, saveUsers, updateProject } from '@/lib/server/storage';
import type { User } from '@/lib/types';

export async function PUT(request: Request, ctx: RouteContext<'/api/users/[id]'>) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Partial<User>;
  const users = await listUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return Response.json({ error: 'Not found' }, { status: 404 });
  if (body.name !== undefined) user.name = String(body.name).trim() || user.name;
  if (body.color) user.color = body.color;
  if (body.role && ['admin', 'editor', 'viewer'].includes(body.role)) {
    if (user.role === 'admin' && body.role !== 'admin' && users.filter((u) => u.role === 'admin').length === 1) {
      return Response.json({ error: 'At least one admin is required' }, { status: 400 });
    }
    user.role = body.role;
  }
  await saveUsers(users);
  return Response.json(user);
}

export async function DELETE(request: Request, ctx: RouteContext<'/api/users/[id]'>) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const transferTo = url.searchParams.get('transferTo');
  const users = await listUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return Response.json({ error: 'Not found' }, { status: 404 });
  if (user.role === 'admin' && users.filter((u) => u.role === 'admin').length === 1) {
    return Response.json({ error: 'Cannot delete the last admin' }, { status: 400 });
  }
  const remaining = users.filter((u) => u.id !== id);
  const heir = remaining.find((u) => u.id === transferTo) ?? remaining.find((u) => u.role === 'admin')!;
  for (const p of await listProjects()) {
    if (p.ownerId === id) await updateProject(p.id, { ownerId: heir.id });
  }
  await saveUsers(remaining);
  return Response.json({ ok: true });
}
