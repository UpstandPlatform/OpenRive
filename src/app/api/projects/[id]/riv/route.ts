import { getProject, getProjectRiv } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: RouteContext<'/api/projects/[id]/riv'>) {
  const { id } = await ctx.params;
  const [p, bytes] = await Promise.all([getProject(id), getProjectRiv(id)]);
  if (!p || !bytes) return Response.json({ error: 'Not found' }, { status: 404 });
  const filename = `${p.meta.name.replace(/[^\w\- ]+/g, '').trim() || 'file'}.riv`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
