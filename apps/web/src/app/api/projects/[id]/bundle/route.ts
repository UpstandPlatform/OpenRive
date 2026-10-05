// Exports a project as a standalone preview bundle (.zip): index.html, index.js,
// the .riv file and — unless ?runtime=cdn — the Rive runtime itself.
import { buildBundle, bundleFileName } from '@openrive/rive/bundle';
import { importRiv } from '@openrive/rive/document';
import { getProjectMeta } from '@openrive/db';
import { handler, notFound, routeId } from '@/lib/server/route';
import { canSeeProject, requireUser } from '@/lib/server/auth';
import { runtimeFiles, runtimeInfo } from '@/lib/server/riveRuntime';
import { readProjectRiv } from '@/lib/server/project-storage';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request, ctx: RouteContext<'/api/projects/[id]/bundle'>) => {
  const { id, error } = routeId((await ctx.params).id);
  if (error) return error;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const meta = await getProjectMeta(id);
  if (!meta || !canSeeProject(guard.user, meta)) return notFound();
  const stored = await readProjectRiv(id);
  if (!stored) return notFound();

  const runtime = new URL(request.url).searchParams.get('runtime') === 'cdn' ? 'cdn' : 'offline';
  const info = await runtimeInfo();
  const riv = new Uint8Array(stored);
  const zip = buildBundle({
    name: meta.name,
    riv,
    doc: importRiv(riv),
    runtime,
    runtimeVersion: info.version,
    runtimeFiles: runtime === 'offline' ? await runtimeFiles(info, request.url) : undefined,
  });

  return new Response(zip, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${bundleFileName(meta.name)}"`,
      'content-length': String(zip.byteLength),
    },
  });
});
