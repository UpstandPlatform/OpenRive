// Small helpers shared by every route handler: zod-validated bodies, consistent
// error shapes, and id validation.
import { formatIssues, idSchema } from '@openrive/shared';
import type { z } from 'zod';

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (error: string, status = 400) => Response.json({ error }, { status });
export const notFound = () => fail('Not found', 404);

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
      console.error('[api]', message);
      return fail(message, 500);
    }
  };
}
