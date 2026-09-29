import { canCreateProjects } from '@openrive/auth';
import { deleteProject, duplicateProject, getProjectMeta } from '@openrive/db';
import { duplicateProjectSchema } from '@openrive/shared';
import { body, fail, handler, json, notFound, routeId } from '@/lib/server/route';
import { canSeeProject, requireUser } from '@/lib/server/auth';
import { cloudEdition, pointProjectRiv, readProjectRiv, removeProjectRiv, uploadProjectRiv } from '@/lib/server/project-storage';

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
  const sourceBytes = cloudEdition() ? await readProjectRiv(id) : null;
  let meta = await duplicateProject(id, guard.user.id);
  if (meta && cloudEdition() && sourceBytes) {
    let key: string | undefined;
    try {
      key = await uploadProjectRiv(meta.id, sourceBytes);
      await pointProjectRiv(meta.id, key);
      meta = (await getProjectMeta(meta.id)) ?? meta;
    } catch (error) {
      await deleteProject(meta.id);
      await removeProjectRiv(key);
      throw error;
    }
  }
  return meta ? json(meta, 201) : notFound();
});
