import { createLocalUser, listUsers } from '@openrive/db';
import { createUserSchema, USER_COLORS, type User } from '@openrive/shared';
import { nanoid } from 'nanoid';
import { body, handler, json } from '@/lib/server/route';
import { authEnabled, requireAdmin, requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const { error } = await requireUser();
  if (error) return error;
  return json(await listUsers());
});

export const POST = handler(async (request: Request) => {
  // with sign-in on, accounts are created from the admin dashboard
  const guard = authEnabled() ? await requireAdmin() : { error: undefined };
  if (guard.error) return guard.error;
  const { data, error } = await body(request, createUserSchema);
  if (error) return error;
  const users = await listUsers();
  const user: User = {
    id: nanoid(10),
    name: data.name,
    color: data.color ?? USER_COLORS[users.length % USER_COLORS.length]!,
    role: data.role,
    createdAt: Date.now(),
  };
  return json(await createLocalUser(user), 201);
});
