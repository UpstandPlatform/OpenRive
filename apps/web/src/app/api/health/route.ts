import { describeDatabase } from '@openrive/db';
import { redisHealth } from '@openrive/auth';
import { env } from '@openrive/shared/env';
import { objectStorageHealth } from '@/lib/server/project-storage';

export const dynamic = 'force-dynamic';

/** Liveness + database check (no access token required; reveals only the backend name). */
export async function GET() {
  try {
    const [{ backend }, redis, objectStorage] = await Promise.all([describeDatabase(), redisHealth(), objectStorageHealth()]);
    return Response.json({ ok: true, storage: backend, edition: env().OPENRIVE_EDITION, redis, objectStorage });
  } catch (e) {
    console.error('[health]', e);
    return Response.json({ ok: false, storage: 'unknown' }, { status: 503 });
  }
}
