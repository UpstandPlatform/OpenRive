import { deleteProject, getProject, updateProject } from '@openrive/db';
import { updateProjectSchema } from '@openrive/shared';
import { fromBase64 } from '@openrive/shared/serialize';
import { body, handler, json, notFound, routeId } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request, ctx: RouteContext<'/api/projects/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const project = await getProject(id);
  if (!project) return notFound();
  // lightweight poll used by the editor to detect changes made by other tools
  if (new URL(request.url).searchParams.has('meta')) return json(project.meta);
  // the document is stored as JSON text: send it through without re-parsing
  return new Response(`{"meta":${JSON.stringify(project.meta)},"doc":${project.doc ?? 'null'}}`, {
    headers: { 'content-type': 'application/json' },
  });
});

export const PUT = handler(async (request: Request, ctx: RouteContext<'/api/projects/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const parsed = await body(request, updateProjectSchema);
  if (parsed.error) return parsed.error;
  const { riv, ...patch } = parsed.data;
  const meta = await updateProject(id, { ...patch, ...(riv ? { riv: fromBase64(riv) } : {}) });
  return meta ? json(meta) : notFound();
});

export const DELETE = handler(async (_request: Request, ctx: RouteContext<'/api/projects/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  await deleteProject(id);
  return json({ ok: true });
});
