import { getOrganizationMemberRole, transferOrganizationOwnership } from '@openrive/db';
import { z } from 'zod';
import { body, fail, handler, json, routeId } from '@/lib/server/route';
import { requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const transferSchema = z.object({ userId: z.string().min(1).max(100) });

/** Transfers ownership atomically; only the active workspace owner can do it. */
export const POST = handler(async (request: Request, ctx: RouteContext<'/api/workspaces/[id]/ownership'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  if (await getOrganizationMemberRole(id, guard.user.id) !== 'owner') {
    return fail('Only the active workspace owner can transfer ownership', 403);
  }
  const parsed = await body(request, transferSchema);
  if (parsed.error) return parsed.error;
  const transferred = await transferOrganizationOwnership(id, guard.user.id, parsed.data.userId);
  return transferred ? json({ ok: true }) : fail('Choose another existing workspace member', 400);
});
