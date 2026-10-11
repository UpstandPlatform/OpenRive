import { deleteOrganization } from '@openrive/db';
import { z } from 'zod';
import { cloudEdition, removeProjectRiv } from '@/lib/server/project-storage';
import { requireUser } from '@/lib/server/auth';
import { body, fail, handler, json, routeId } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const deleteSchema = z.object({ confirmation: z.string().trim().min(1).max(80) }).strict();

/** Permanently deletes an owned workspace and its projects; personal files are never affected. */
export const DELETE = handler(async (request: Request, ctx: RouteContext<'/api/workspaces/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const parsed = await body(request, deleteSchema);
  if (parsed.error) return parsed.error;

  const result = await deleteOrganization(id, guard.user.id, parsed.data.confirmation);
  if (result.status === 'forbidden') return fail('Only the current workspace owner can delete this workspace', 403);
  if (result.status === 'missing') return fail('Workspace not found', 404);
  if (result.status === 'name-mismatch') return fail('Workspace name changed. Refresh and confirm the current name.', 409);

  if (cloudEdition()) await Promise.all(result.storageKeys.map(removeProjectRiv));
  return json({ ok: true });
});
