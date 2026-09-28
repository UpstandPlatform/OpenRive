import { createAccount, listAccounts } from '@openrive/auth';
import { adminCreateUserSchema } from '@openrive/shared';
import { requireAdmin } from '@/lib/server/auth';
import { body, fail, handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const { error } = await requireAdmin();
  if (error) return error;
  return json(await listAccounts());
});

export const POST = handler(async (request: Request) => {
  const { error } = await requireAdmin();
  if (error) return error;
  const parsed = await body(request, adminCreateUserSchema);
  if (parsed.error) return parsed.error;
  try {
    const account = await createAccount({
      name: parsed.data.name,
      email: parsed.data.email || null,
      password: parsed.data.password || undefined,
      role: parsed.data.role,
    });
    return json(account, 201);
  } catch (e) {
    return fail((e as Error).message);
  }
});
