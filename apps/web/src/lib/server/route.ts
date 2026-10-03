// Small helpers shared by every route handler: zod-validated bodies, consistent
// error shapes, and id validation.
import { formatIssues, idSchema } from '@openrive/shared';
import type { z } from 'zod';

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
 * browser origins. With neither configured, local development falls back to
 * the request URL (and forwarded proxy headers when available).
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
      const fallbackOrigins = [new URL(request.url).origin];
      const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
      const forwardedHost = (request.headers.get('x-forwarded-host') ?? request.headers.get('host'))?.split(',')[0]?.trim();
      if (forwardedProto && forwardedHost) {
        try {
          fallbackOrigins.push(new URL(`${forwardedProto}://${forwardedHost}`).origin);
        } catch {
          // Ignore malformed proxy metadata and rely on the configured origin.
        }
      }
      const allowedOrigins = configured.length ? configured : fallbackOrigins;
      if (!allowedOrigins.includes(requestOrigin)) return fail('Cross-origin request rejected', 403);
    } catch {
      return fail('Invalid request origin', 403);
    }
  } else if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return fail('Cross-origin request rejected', 403);
  }
  return null;
}

/** Parses a JSON body with a schema; returns a 400 response when it doesn't fit. */
export async function body<S extends z.ZodType>(request: Request, schema: S): Promise<{ data: z.infer<S>; error?: never } | { data?: never; error: Response }> {
  const raw = await request.json().catch(() => ({}));
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
      return await fn(...args);
    } catch (e) {
      const message = (e as Error).message || 'Unexpected error';
      console.error('[api]', e);
      return fail(process.env.NODE_ENV === 'development' ? message : 'Internal server error', 500);
    }
  };
}
