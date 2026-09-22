import { duplicateProject } from '@openrive/db';
import { duplicateProjectSchema } from '@openrive/shared';
import { body, handler, json, notFound, routeId } from '@/lib/server/route';

export const POST = handler(async (request: Request, ctx: RouteContext<'/api/projects/[id]/duplicate'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const parsed = await body(request, duplicateProjectSchema);
  if (parsed.error) return parsed.error;
  const meta = await duplicateProject(id, parsed.data.ownerId);
  return meta ? json(meta, 201) : notFound();
});
