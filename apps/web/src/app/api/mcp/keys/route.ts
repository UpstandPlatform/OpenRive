import { z } from 'zod';
import { auth, authEnabled, requireUser } from '@/lib/server/auth';
import { body, fail, handler, json, requireSameOrigin } from '@/lib/server/route';
import { headers } from 'next/headers';

const createKeySchema = z.object({
  name: z.string().trim().min(1).max(32).default('OpenRive MCP'),
  expiresIn: z.number().int().positive().max(365 * 24 * 60 * 60).optional(),
});
const deleteKeySchema = z.object({ keyId: z.string().trim().min(1).max(128) });

async function browserUser() {
  const requestHeaders = await headers();
  if (requestHeaders.get('authorization')?.startsWith('Bearer ')) {
    return { error: fail('Sign in with the browser session to manage MCP keys', 403) } as const;
  }
  const guard = await requireUser();
  return guard.error ? { error: guard.error } as const : { user: guard.user } as const;
}

/** Creates a user-scoped MCP bearer key. The secret is returned only once. */
export const POST = handler(async (request: Request) => {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!authEnabled()) return fail('API keys are only needed for authenticated self-hosted or cloud deployments', 400);
  const guard = await browserUser();
  if (guard.error) return guard.error;
  const parsed = await body(request, createKeySchema);
  if (parsed.error) return parsed.error;
  const result = await (await auth()).api.createApiKey({
    headers: await headers(),
    body: {
      configId: 'mcp',
      name: parsed.data.name,
      expiresIn: parsed.data.expiresIn,
      metadata: { product: 'OpenRive', purpose: 'MCP' },
    },
  });
  return json(result, 201);
});

/** Lists metadata only; Better Auth never returns the secret after creation. */
export const GET = handler(async () => {
  if (!authEnabled()) return fail('API keys are only needed for authenticated self-hosted or cloud deployments', 400);
  const guard = await browserUser();
  if (guard.error) return guard.error;
  return json(await (await auth()).api.listApiKeys({ headers: await headers(), query: { configId: 'mcp' } }));
});

/** Revokes a key immediately. */
export const DELETE = handler(async (request: Request) => {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!authEnabled()) return fail('API keys are only needed for authenticated self-hosted or cloud deployments', 400);
  const guard = await browserUser();
  if (guard.error) return guard.error;
  const parsed = await body(request, deleteKeySchema);
  if (parsed.error) return parsed.error;
  return json(await (await auth()).api.deleteApiKey({ headers: await headers(), body: { configId: 'mcp', keyId: parsed.data.keyId } }));
});
