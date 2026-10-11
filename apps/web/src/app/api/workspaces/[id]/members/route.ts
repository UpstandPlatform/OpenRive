import { updateOrganizationMemberRole } from '@openrive/db';
import { z } from 'zod';
import { body, fail, handler, json, routeId } from '@/lib/server/route';
import { requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const roleSchema = z.object({ userId: z.string().min(1).max(100), role: z.enum(['admin', 'editor', 'viewer']) });

/** Applies a bounded role change; Better Auth's hook does not expose the actor. */
export const PATCH = handler(async (request: Request, ctx: RouteContext<'/api/workspaces/[id]/members'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const parsed = await body(request, roleSchema);
  if (parsed.error) return parsed.error;
  const result = await updateOrganizationMemberRole(id, guard.user.id, parsed.data.userId, parsed.data.role);
  if (result === 'forbidden') return fail('Only workspace owners can assign administrators; workspace administrators can manage editor/viewer access', 403);
  return result === 'updated' ? json({ ok: true }) : fail('The member was not found or is the workspace owner', 404);
});
