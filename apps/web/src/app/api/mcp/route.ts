import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { canCreateProjects, canEditProject, canManageProject, canSeeProject, type Account } from '@openrive/auth';
import { createMcpServer } from '@openrive/cli/mcp-server';
import { env } from '@openrive/shared/env';
import { requireUser } from '@/lib/server/auth';
import { limitedRequest, MAX_MCP_BODY_BYTES, requireSameOrigin } from '@/lib/server/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Session = {
  userId: string;
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
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createMcpServer({
    ownerId: user.id,
    canCreateProjects: canCreateProjects(user),
    canSeeProject: (project) => canSeeProject(user, project),
    canEditProject: (project) => canEditProject(user, project),
    canManageProject: (project) => canManageProject(user, project),
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
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessionKey = id;
        sessions.set(id, { userId: user.id, createdAt: Date.now(), lastUsedAt: Date.now(), transport });
      },
    });
    transport.onclose = () => {
      if (sessionKey) sessions.delete(sessionKey);
    };
    const server = createMcpServer({
      ownerId: user.id,
      canCreateProjects: canCreateProjects(user),
      canSeeProject: (project) => canSeeProject(user, project),
      canEditProject: (project) => canEditProject(user, project),
      canManageProject: (project) => canManageProject(user, project),
      allowFilePaths: false,
      editorUrlBase: env().OPENRIVE_URL,
    });
    await server.connect(transport);
    session = { userId: user.id, createdAt: Date.now(), lastUsedAt: Date.now(), transport };
  }

  session.lastUsedAt = Date.now();
  const response = await session.transport.handleRequest(request);
  reapSessions();
  return response;
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
