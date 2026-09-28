import { authEnabled, createFirstAdmin, needsSetup, startSession } from '@openrive/auth';
import { setupSchema } from '@openrive/shared';
import { cookies } from 'next/headers';
import { isSecureRequest, sessionCookie } from '@/lib/server/auth';
import { body, fail, handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

/** Creates the first account, which becomes the administrator, and signs it in. */
export const POST = handler(async (request: Request) => {
  if (!authEnabled()) return fail('This server does not use sign-in', 400);
  if (!(await needsSetup())) return fail('This server already has an account', 409);
  const { data, error } = await body(request, setupSchema);
  if (error) return error;
  const account = await createFirstAdmin({ name: data.name, email: data.email || null, password: data.password });
  const session = await startSession(account.id, request.headers.get('user-agent') ?? undefined);
  const store = await cookies();
  store.set(sessionCookie(session.sessionId, session.expiresAt, isSecureRequest(request)));
  return json({ user: account }, 201);
});
