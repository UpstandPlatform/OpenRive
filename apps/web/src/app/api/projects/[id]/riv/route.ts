import { getProjectMeta, getProjectRiv } from '@openrive/db';
import { handler, notFound, routeId } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_request: Request, ctx: RouteContext<'/api/projects/[id]/riv'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const [meta, bytes] = await Promise.all([getProjectMeta(id), getProjectRiv(id)]);
  if (!meta || !bytes) return notFound();
  const filename = `${meta.name.replace(/[^\w\- ]+/g, '').trim() || 'file'}.riv`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
});
