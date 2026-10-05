import { getProjectMeta } from '@openrive/db';
import { handler, notFound, routeId } from '@/lib/server/route';
import { canSeeProject, requireUser } from '@/lib/server/auth';
import { readProjectRiv } from '@/lib/server/project-storage';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_request: Request, ctx: RouteContext<'/api/projects/[id]/riv'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const meta = await getProjectMeta(id);
  if (!meta || !canSeeProject(guard.user, meta)) return notFound();
  const bytes = await readProjectRiv(id);
  if (!bytes) return notFound();
  const filename = `${meta.name.replace(/[^\w\- ]+/g, '').trim() || 'file'}.riv`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
});
