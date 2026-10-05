// Small helpers shared by every route handler: zod-validated bodies, consistent
// error shapes, and id validation.
import { formatIssues, idSchema } from '@openrive/shared';
import type { z } from 'zod';

export const MAX_STANDARD_JSON_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECT_JSON_BODY_BYTES = 192 * 1024 * 1024;
export const MAX_MCP_BODY_BYTES = 192 * 1024 * 1024;

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (error: string, status = 400) => Response.json({ error }, { status });
export const notFound = () => fail('Not found', 404);

/**
 * Cookie-authenticated mutations must come from this origin. Bearer-authenticated
 * MCP calls are exempt because they do not carry the browser session cookie.
 *
 * A reverse proxy can make `request.url` describe the internal HTTP hop while
 * the browser sees the public HTTPS URL. In production, OPENRIVE_URL is the
 * canonical public origin; OPENRIVE_TRUSTED_ORIGINS can add explicitly trusted
 * browser origins. With neither configured, local development falls back to the
 * actual request URL. Forwarded headers are deliberately never trusted here:
 * they are client-controlled unless a trusted edge proxy has already stripped
 * and rewritten them.
 */
export function requireSameOrigin(request: Request): Response | null {
  if (request.headers.get('authorization')?.startsWith('Bearer ')) return null;
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const requestOrigin = new URL(origin).origin;
      const configured = [
        process.env.OPENRIVE_URL,
        ...(process.env.OPENRIVE_TRUSTED_ORIGINS?.split(',') ?? []),
      ]
        .map((value) => {
          try {
            return value?.trim() ? new URL(value.trim()).origin : null;
          } catch {
            return null;
          }
        })
        .filter((value): value is string => !!value);
      const allowedOrigins = configured.length ? configured : [new URL(request.url).origin];
      if (!allowedOrigins.includes(requestOrigin)) return fail('Cross-origin request rejected', 403);
    } catch {
      return fail('Invalid request origin', 403);
    }
  } else if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return fail('Cross-origin request rejected', 403);
  }
  return null;
}

class BodyTooLargeError extends Error {}

async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Reads a request body once, enforcing a hard limit before downstream parsing. */
export async function limitedRequest(request: Request, maxBytes: number): Promise<Request | Response> {
  if (!request.body || request.method === 'GET' || request.method === 'HEAD') return request;
  try {
    const bytes = await readLimitedBody(request, maxBytes);
    return new Request(request, { body: new Blob([bytes as unknown as ArrayBuffer]) });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return fail('Request body is too large', 413);
    throw error;
  }
}

/** Parses a bounded JSON body with a schema; returns a 400 response when invalid. */
export async function body<S extends z.ZodType>(request: Request, schema: S, maxBytes = MAX_STANDARD_JSON_BODY_BYTES): Promise<{ data: z.infer<S>; error?: never } | { data?: never; error: Response }> {
  let raw: unknown = {};
  try {
    const bytes = await readLimitedBody(request, maxBytes);
    if (bytes.length) raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return { error: fail('Request body is too large', 413) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: fail(formatIssues(parsed.error)) };
  return { data: parsed.data };
}

/** Validates a route parameter id. */
export function routeId(id: string): { id: string; error?: never } | { id?: never; error: Response } {
  const parsed = idSchema.safeParse(id);
  return parsed.success ? { id: parsed.data } : { error: fail('Invalid id') };
}

/** Wraps a handler so database or validation errors become clean 500s instead of stack traces. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      const request = args[0] as Request | undefined;
      if (request && typeof request.method === 'string' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const originError = requireSameOrigin(request);
        if (originError) return originError;
      }
      return await fn(...args);
    } catch (e) {
      const message = (e as Error).message || 'Unexpected error';
      console.error('[api]', e);
      return fail(process.env.NODE_ENV === 'development' ? message : 'Internal server error', 500);
    }
  };
}
