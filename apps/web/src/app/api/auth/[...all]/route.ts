// Better Auth's own endpoints: /api/auth/sign-in/email, /api/auth/sign-up/email,
// /api/auth/sign-out, /api/auth/get-session and the rest.
//
// The instance is built on first use (it opens the database, which may start an
// embedded PostgreSQL), so the handler awaits it instead of being created at
// import time.
import { auth } from '@openrive/auth';
import { notFound } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const handle = async (request: Request) => {
  const pathname = new URL(request.url).pathname;
  // MCP API keys are managed through /api/mcp/keys so key count limits and
  // fixed permissions cannot be bypassed via direct plugin endpoints.
  if (pathname.startsWith('/api/auth/api-key/')) return notFound();
  return (await auth()).handler(request);
};

export { handle as GET, handle as POST };
