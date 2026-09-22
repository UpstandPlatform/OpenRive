import { createProject, listProjects, updateProject } from '@/lib/server/storage';
import { fromBase64 } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await listProjects());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.doc !== 'string') return Response.json({ error: 'doc is required' }, { status: 400 });
  const meta = await createProject({
    name: String(body.name ?? 'Untitled'),
    ownerId: String(body.ownerId ?? ''),
    doc: body.doc,
    riv: typeof body.riv === 'string' ? fromBase64(body.riv) : undefined,
  });
  const next = await updateProject(meta.id, {
    thumbnail: body.thumbnail,
    artboards: body.artboards,
    animations: body.animations,
    stateMachines: body.stateMachines,
  });
  return Response.json(next, { status: 201 });
}
