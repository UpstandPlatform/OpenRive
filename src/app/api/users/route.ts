import { nanoid } from 'nanoid';
import { listUsers, saveUsers } from '@/lib/server/storage';
import type { Role, User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await listUsers());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<User>;
  const name = String(body.name ?? '').trim();
  if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });
  const users = await listUsers();
  const role: Role = body.role === 'admin' || body.role === 'viewer' ? body.role : 'editor';
  const user: User = { id: nanoid(10), name, color: body.color || '#2bb3ff', role, createdAt: Date.now() };
  users.push(user);
  await saveUsers(users);
  return Response.json(user, { status: 201 });
}
