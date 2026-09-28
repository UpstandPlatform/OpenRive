import { canCreateProjects } from '@openrive/auth';
import { duplicateProject, getProjectMeta } from '@openrive/db';
import { duplicateProjectSchema } from '@openrive/shared';
import { body, fail, handler, json, notFound, routeId } from '@/lib/server/route';
import { canSeeProject, requireUser } from '@/lib/server/auth';

export const POST = handler(async (request: Request, ctx: RouteContext<'/api/projects/[id]/duplicate'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  if (!canCreateProjects(guard.user)) return fail('Viewers cannot create files', 403);
  const source = await getProjectMeta(id);
  if (!source) return notFound();
  if (!canSeeProject(guard.user, source)) return notFound();
  const parsed = await body(request, duplicateProjectSchema);
  if (parsed.error) return parsed.error;
  // the copy belongs to whoever duplicated it
  const meta = await duplicateProject(id, guard.user.id);
  return meta ? json(meta, 201) : notFound();
});
