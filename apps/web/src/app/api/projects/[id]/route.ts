import { deleteProject, getProject, getProjectAsset, getProjectMeta, listUsers, updateProject } from '@openrive/db';
import { updateProjectSchema } from '@openrive/shared';
import { fromBase64 } from '@openrive/shared/serialize';
import { body, fail, handler, json, notFound, routeId } from '@/lib/server/route';
import { canSeeProject, canTransferProject, requireEdit, requireProjectManager, requireUser } from '@/lib/server/auth';
import { cloudEdition, pointProjectRiv, removeProjectRiv, uploadProjectRiv } from '@/lib/server/project-storage';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request, ctx: RouteContext<'/api/projects/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const project = await getProject(id);
  if (!project) return notFound();
  if (!canSeeProject(guard.user, project.meta)) return notFound();
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
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const existing = await getProjectMeta(id);
  if (!existing) return notFound();
  const denied = requireEdit(guard.user, existing);
  if (denied) return denied;
  const parsed = await body(request, updateProjectSchema);
  if (parsed.error) return parsed.error;
  const { riv, ownerId, sharedWith, ...patch } = parsed.data;
  if (ownerId !== undefined || sharedWith !== undefined) {
    if (ownerId !== undefined && !canTransferProject(guard.user)) return fail('Only an administrator may transfer ownership', 403);
    const managed = requireProjectManager(guard.user, existing);
    if (managed) return managed;
    const users = await listUsers();
    const allowed = new Set(users.map((user) => user.id));
    if (ownerId !== undefined && !allowed.has(ownerId)) return fail('Ownership transfer targets an unknown user', 400);
    if (sharedWith?.some((userId) => !allowed.has(userId))) return fail('Sharing includes an unknown user', 400);
  }
  const accessPatch = {
    ...(ownerId !== undefined ? { ownerId } : {}),
    ...(sharedWith !== undefined ? { sharedWith: [...new Set(sharedWith)] } : {}),
  };
  const bytes = riv ? fromBase64(riv) : undefined;
  const oldAsset = bytes && cloudEdition() ? await getProjectAsset(id) : null;
  const newKey = bytes && cloudEdition() ? await uploadProjectRiv(id, bytes) : undefined;
  let meta: Awaited<ReturnType<typeof updateProject>>;
  try {
    meta = await updateProject(id, { ...patch, ...(bytes && !cloudEdition() ? { riv: bytes } : {}), ...accessPatch });
    if (meta && newKey) await pointProjectRiv(id, newKey);
  } catch (error) {
    if (newKey) await removeProjectRiv(newKey);
    throw error;
  }
  if (!meta) {
    if (newKey) await removeProjectRiv(newKey);
    return notFound();
  }
  if (newKey && oldAsset?.rivStorageKey && oldAsset.rivStorageKey !== newKey) await removeProjectRiv(oldAsset.rivStorageKey);
  return meta ? json(meta) : notFound();
});

export const DELETE = handler(async (_request: Request, ctx: RouteContext<'/api/projects/[id]'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const existing = await getProjectMeta(id);
  if (!existing) return notFound();
  const denied = requireProjectManager(guard.user, existing);
  if (denied) return denied;
  const asset = await getProjectAsset(id);
  await deleteProject(id);
  if (cloudEdition()) await removeProjectRiv(asset?.rivStorageKey);
  return json({ ok: true });
});
