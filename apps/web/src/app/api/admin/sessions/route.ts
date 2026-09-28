import { endSession, listSessions, revokeUserSessions } from '@openrive/auth';
import { requireAdmin } from '@/lib/server/auth';
import { fail, handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const { error } = await requireAdmin();
  if (error) return error;
  return json(await listSessions());
});

/** Signs a session out, or every session of one user with ?user=<id>. */
export const DELETE = handler(async (request: Request) => {
  const { error } = await requireAdmin();
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const userId = params.get('user');
  const sessionId = params.get('session');
  if (userId) await revokeUserSessions(userId);
  else if (sessionId) await endSession(sessionId);
  else return fail('Pass ?user= or ?session=');
  return json({ ok: true });
});
