import { listUsers, saveUsers } from '@openrive/db';
import { createUserSchema, USER_COLORS, type User } from '@openrive/shared';
import { nanoid } from 'nanoid';
import { body, handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => json(await listUsers()));

export const POST = handler(async (request: Request) => {
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
  await saveUsers([...users, user]);
  return json(user, 201);
});
