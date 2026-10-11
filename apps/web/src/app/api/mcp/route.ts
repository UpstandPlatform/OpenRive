import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { canCreateProject, canEditProject, canManageProject, canSeeProject, type Account } from '@openrive/auth';
import { createMcpServer } from '@openrive/cli/mcp-server';
import { env } from '@openrive/shared/env';
import { requireUser } from '@/lib/server/auth';
import { limitedRequest, MAX_MCP_BODY_BYTES, requireSameOrigin } from '@/lib/server/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Session = {
  userId: string;
  authorization: { user: Account };
  organizationId?: string;
  queue: Promise<void>;
  createdAt: number;
  lastUsedAt: number;
  transport: WebStandardStreamableHTTPServerTransport;
};

// Stateful mode is retained for local/self-hosted clients that use session
// resumability. Cloud defaults to stateless mode so every request is safe to
// route to any replica without depending on in-process session memory.
const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 256;

function reapSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      void session.transport.close();
      sessions.delete(id);
    }
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0];
    if (!oldest) break;
    void oldest[1].transport.close();
    sessions.delete(oldest[0]);
  }
}

async function userForRequest() {
  const guard = await requireUser();
  return guard.error ? { response: guard.error } : { user: guard.user };
}

async function statelessHandle(request: Request, user: Account): Promise<Response> {
  const authorization = { user };
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createMcpServer({
    ownerId: authorization.user.id,
    canCreateProject: () => canCreateProject(authorization.user),
    organizationId: () => authorization.user.activeOrganizationId,
    canSeeProject: (project) => canSeeProject(authorization.user, project),
    canEditProject: (project) => canEditProject(authorization.user, project),
    canManageProject: (project) => canManageProject(authorization.user, project),
    allowFilePaths: false,
    editorUrlBase: env().OPENRIVE_URL,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

async function handle(request: Request): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const bounded = await limitedRequest(request, MAX_MCP_BODY_BYTES);
  if (bounded instanceof Response) return bounded;
  request = bounded;
  reapSessions();
  const guard = await userForRequest();
  if (guard.response) return guard.response;
  const user = guard.user;
  const settings = env();
  if (settings.OPENRIVE_MCP_STATELESS === 'true' || (settings.OPENRIVE_MCP_STATELESS === 'auto' && settings.OPENRIVE_EDITION === 'cloud')) {
    if (request.method !== 'POST') return Response.json({ error: 'Stateless MCP accepts POST requests only' }, { status: 405, headers: { allow: 'POST' } });
    return statelessHandle(request, user);
  }
  const sessionId = request.headers.get('mcp-session-id');
  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (sessionId && !session) return Response.json({ error: 'MCP session not found' }, { status: 404 });
  if (session && session.userId !== user.id) return Response.json({ error: 'MCP session belongs to another user' }, { status: 403 });

  if (!session) {
    if (request.method !== 'POST') return Response.json({ error: 'Start an MCP session with POST initialize' }, { status: 400 });
    let sessionKey: string | undefined;
    const authorization = { user };
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessionKey = id;
        if (session) sessions.set(id, session);
      },
    });
    transport.onclose = () => {
      if (sessionKey) sessions.delete(sessionKey);
    };
    const server = createMcpServer({
      ownerId: authorization.user.id,
      canCreateProject: () => canCreateProject(authorization.user),
      organizationId: () => authorization.user.activeOrganizationId,
      canSeeProject: (project) => canSeeProject(authorization.user, project),
      canEditProject: (project) => canEditProject(authorization.user, project),
      canManageProject: (project) => canManageProject(authorization.user, project),
      allowFilePaths: false,
      editorUrlBase: env().OPENRIVE_URL,
    });
    await server.connect(transport);
    session = {
      userId: user.id,
      authorization,
      ...(user.activeOrganizationId ? { organizationId: user.activeOrganizationId } : {}),
      queue: Promise.resolve(),
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      transport,
    };
  }

  // Serialize requests so a mutable authorization context cannot race between
  // concurrent MCP calls. A session stays bound to its initialized workspace;
  // start a new MCP session to switch workspace context.
  const previousRequest = session.queue;
  let releaseRequest!: () => void;
  session.queue = new Promise<void>((resolve) => { releaseRequest = resolve; });
  await previousRequest;
  try {
    if (user.activeOrganizationId !== session.organizationId) {
      return Response.json({ error: 'This MCP session is bound to a different workspace. Start a new session to switch workspaces.' }, { status: 409 });
    }
    // Refresh role, disabled status, and current workspace membership on every
    // request, including requests on an already initialized stateful session.
    session.authorization.user = user;
    session.lastUsedAt = Date.now();
    return await session.transport.handleRequest(request);
  } finally {
    releaseRequest();
    reapSessions();
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
