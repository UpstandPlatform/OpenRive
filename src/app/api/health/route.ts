import { storage } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

/** Liveness + storage check (no auth required; reveals only the backend name). */
export async function GET() {
  try {
    await storage().readUsers();
    return Response.json({ ok: true, storage: storage().name });
  } catch (e) {
    return Response.json({ ok: false, storage: storage().name, error: (e as Error).message }, { status: 503 });
  }
}
