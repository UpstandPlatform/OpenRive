import { authEnabled, needsSetup } from '@openrive/auth';
import { currentUser } from '@/lib/server/auth';
import { handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

/** What the browser needs to decide between the app, the login page and setup. */
export const GET = handler(async () =>
  json({
    authEnabled: authEnabled(),
    needsSetup: authEnabled() ? await needsSetup() : false,
    user: await currentUser(),
  }),
);
