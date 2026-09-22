import { createProject, listProjects } from '@openrive/db';
import { createProjectSchema } from '@openrive/shared';
import { fromBase64 } from '@openrive/shared/serialize';
import { body, handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => json(await listProjects()));

export const POST = handler(async (request: Request) => {
  const { data, error } = await body(request, createProjectSchema);
  if (error) return error;
  const meta = await createProject({
    name: data.name,
    ownerId: data.ownerId,
    doc: data.doc,
    riv: data.riv ? fromBase64(data.riv) : undefined,
    thumbnail: data.thumbnail,
    artboards: data.artboards,
    animations: data.animations,
    stateMachines: data.stateMachines,
  });
  return json(meta, 201);
});
