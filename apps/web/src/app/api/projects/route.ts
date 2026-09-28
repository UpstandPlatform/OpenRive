import { createProject, listProjects } from '@openrive/db';
import { createProjectSchema } from '@openrive/shared';
import { fromBase64 } from '@openrive/shared/serialize';
import { canCreateProjects } from '@openrive/auth';
import { body, fail, handler, json } from '@/lib/server/route';
import { canSeeProject, requireUser } from '@/lib/server/auth';

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
  const meta = await createProject({
    name: data.name,
    // files always belong to whoever created them
    ownerId: guard.user.id,
    doc: data.doc,
    riv: data.riv ? fromBase64(data.riv) : undefined,
    thumbnail: data.thumbnail,
    artboards: data.artboards,
    animations: data.animations,
    stateMachines: data.stateMachines,
  });
  return json(meta, 201);
});
