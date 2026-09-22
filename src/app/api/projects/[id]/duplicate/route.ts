import { duplicateProject } from '@/lib/server/storage';

export async function POST(request: Request, ctx: RouteContext<'/api/projects/[id]/duplicate'>) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const meta = await duplicateProject(id, String(body.ownerId ?? ''));
  if (!meta) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(meta, { status: 201 });
}
