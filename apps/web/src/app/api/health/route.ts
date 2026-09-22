import { describeDatabase } from '@openrive/db';

export const dynamic = 'force-dynamic';

/** Liveness + database check (no access token required; reveals only the backend name). */
export async function GET() {
  try {
    const { backend } = await describeDatabase();
    return Response.json({ ok: true, storage: backend });
  } catch (e) {
    return Response.json({ ok: false, storage: 'unknown', error: (e as Error).message }, { status: 503 });
  }
}
