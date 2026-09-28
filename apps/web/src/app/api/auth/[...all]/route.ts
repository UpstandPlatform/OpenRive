// Better Auth's own endpoints: /api/auth/sign-in/email, /api/auth/sign-up/email,
// /api/auth/sign-out, /api/auth/get-session and the rest.
//
// The instance is built on first use (it opens the database, which may start an
// embedded PostgreSQL), so the handler awaits it instead of being created at
// import time.
import { auth } from '@openrive/auth';

export const dynamic = 'force-dynamic';

const handle = async (request: Request) => (await auth()).handler(request);

export { handle as GET, handle as POST };
