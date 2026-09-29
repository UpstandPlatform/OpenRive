import { createProject, deleteProject, getProjectMeta, listProjects } from '@openrive/db';
import { createProjectSchema } from '@openrive/shared';
import { fromBase64 } from '@openrive/shared/serialize';
import { canCreateProjects } from '@openrive/auth';
import { body, fail, handler, json } from '@/lib/server/route';
import { canSeeProject, requireUser } from '@/lib/server/auth';
import { cloudEdition, pointProjectRiv, removeProjectRiv, uploadProjectRiv } from '@/lib/server/project-storage';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const { user, error } = await requireUser();
  if (error) return error;
  // viewers and admins see everything; editors see their own and shared files
  return json((await listProjects()).filter((p) => canSeeProject(user, p)));
});

export const POST = handler(async (request: Request) => {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  if (!canCreateProjects(guard.user)) return fail('Viewers cannot create files', 403);
  const { data, error } = await body(request, createProjectSchema);
  if (error) return error;
  const bytes = data.riv ? fromBase64(data.riv) : undefined;
  let meta = await createProject({
    name: data.name,
    // files always belong to whoever created them
    ownerId: guard.user.id,
    doc: data.doc,
    riv: cloudEdition() ? undefined : bytes,
    thumbnail: data.thumbnail,
    artboards: data.artboards,
    animations: data.animations,
    stateMachines: data.stateMachines,
  });
  if (cloudEdition() && bytes) {
    let key: string | undefined;
    try {
      key = await uploadProjectRiv(meta.id, bytes);
      await pointProjectRiv(meta.id, key);
      meta = (await getProjectMeta(meta.id)) ?? meta;
    } catch (error) {
      await deleteProject(meta.id);
      await removeProjectRiv(key);
      throw error;
    }
  }
  return json(meta, 201);
});
