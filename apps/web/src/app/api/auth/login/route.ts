import { authEnabled, signIn } from '@openrive/auth';
import { loginSchema } from '@openrive/shared';
import { cookies } from 'next/headers';
import { isSecureRequest, sessionCookie } from '@/lib/server/auth';
import { body, fail, handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const POST = handler(async (request: Request) => {
  if (!authEnabled()) return fail('This server does not use sign-in', 400);
  const { data, error } = await body(request, loginSchema);
  if (error) return error;
  const result = await signIn(data.login, data.password, request.headers.get('user-agent') ?? undefined);
  // the same message either way, so it never reveals which accounts exist
  if (!result) return fail('That name or password is not right', 401);
  const store = await cookies();
  store.set(sessionCookie(result.sessionId, result.expiresAt, isSecureRequest(request)));
  return json({ user: result.user });
});
