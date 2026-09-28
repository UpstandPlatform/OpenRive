import { endSession, SESSION_COOKIE } from '@openrive/auth';
import { cookies } from 'next/headers';
import { handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (id) await endSession(id);
  store.delete(SESSION_COOKIE);
  return json({ ok: true });
});
