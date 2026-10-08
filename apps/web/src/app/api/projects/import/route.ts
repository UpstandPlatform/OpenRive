import { canCreateProjects } from '@openrive/auth';
import { MAX_RIV_BYTES } from '@openrive/shared';
import { fail, handler, json, limitedRequest, requireSameOrigin } from '@/lib/server/route';
import { requireUser } from '@/lib/server/auth';
import { importProjectBytes, InvalidRivError } from '@/lib/server/project-import';

export const dynamic = 'force-dynamic';
/** Multipart upload endpoint used by the dashboard and the desktop build. */
export const POST = handler(async (request: Request) => {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const bounded = await limitedRequest(request, MAX_RIV_BYTES + 2 * 1024 * 1024);
  if (bounded instanceof Response) return bounded;
  request = bounded;
  const guard = await requireUser();
  if (guard.error) return guard.error;
  if (!canCreateProjects(guard.user)) return fail('Viewers cannot create files', 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Invalid multipart form data');
  }
  const uploaded = form.get('file');
  if (!uploaded || typeof uploaded !== 'object' || !('arrayBuffer' in uploaded) || typeof uploaded.arrayBuffer !== 'function') {
    return fail('Upload a .riv file in the "file" field');
  }
  const file = uploaded as File;
  const filename = file.name || 'Untitled.riv';
  if (!filename.toLowerCase().endsWith('.riv')) return fail('Only .riv files can be imported');
  if (file.size > MAX_RIV_BYTES) return fail('The .riv file is larger than the 100 MB upload limit', 413);

  const requestedName = form.get('name');
  const name = typeof requestedName === 'string' && requestedName.trim() ? requestedName : filename.replace(/\.riv$/i, '');
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return json(await importProjectBytes(name, guard.user.id, bytes), 201);
  } catch (error) {
    if (error instanceof InvalidRivError) return fail(error.message, 400);
    throw error;
  }
});
