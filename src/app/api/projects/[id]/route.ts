import { deleteProject, getProject, updateProject } from '@/lib/server/storage';
import { fromBase64 } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: RouteContext<'/api/projects/[id]'>) {
  const { id } = await ctx.params;
  const p = await getProject(id);
  if (!p) return Response.json({ error: 'Not found' }, { status: 404 });
  // lightweight poll used by the editor to detect changes made by other tools
  if (new URL(request.url).searchParams.has('meta')) return Response.json(p.meta);
  return new Response(`{"meta":${JSON.stringify(p.meta)},"doc":${p.doc ?? 'null'}}`, {
    headers: { 'content-type': 'application/json' },
  });
}

export async function PUT(request: Request, ctx: RouteContext<'/api/projects/[id]'>) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const meta = await updateProject(id, {
    ...(typeof body.name === 'string' ? { name: body.name.trim() || 'Untitled' } : {}),
    ...(typeof body.doc === 'string' ? { doc: body.doc } : {}),
    ...(typeof body.riv === 'string' ? { riv: fromBase64(body.riv) } : {}),
    ...(typeof body.thumbnail === 'string' ? { thumbnail: body.thumbnail } : {}),
    ...(typeof body.ownerId === 'string' ? { ownerId: body.ownerId } : {}),
    ...(Array.isArray(body.sharedWith) ? { sharedWith: body.sharedWith.map(String) } : {}),
    ...(typeof body.artboards === 'number'
      ? { artboards: body.artboards, animations: body.animations, stateMachines: body.stateMachines }
      : {}),
  });
  if (!meta) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(meta);
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/projects/[id]'>) {
  const { id } = await ctx.params;
  await deleteProject(id);
  return Response.json({ ok: true });
}
