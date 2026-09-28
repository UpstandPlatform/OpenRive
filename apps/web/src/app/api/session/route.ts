import { authEnabled, needsSetup, signupMode } from '@openrive/auth';
import { currentUser } from '@/lib/server/auth';
import { handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

/** What the browser needs to decide between the app, signing in and signing up. */
export const GET = handler(async () => {
  const enabled = authEnabled();
  const first = enabled ? await needsSetup() : false;
  return json({
    authEnabled: enabled,
    // nobody can sign in yet, so the next account created runs the server
    needsSetup: first,
    // the sign-up page is open to anyone, to the first account only, or to nobody
    canSignUp: enabled && (signupMode() === 'open' || (signupMode() === 'first' && first)),
    user: await currentUser(),
  });
});
