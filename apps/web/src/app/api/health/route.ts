import { describeDatabase } from '@openrive/db';
import { redisHealth } from '@openrive/auth';

export const dynamic = 'force-dynamic';

/** Liveness + database check (no access token required; reveals only the backend name). */
export async function GET() {
  try {
    const [{ backend }, redis] = await Promise.all([describeDatabase(), redisHealth()]);
    return Response.json({ ok: true, storage: backend, redis });
  } catch (e) {
    console.error('[health]', e);
    return Response.json({ ok: false, storage: 'unknown' }, { status: 503 });
  }
}
