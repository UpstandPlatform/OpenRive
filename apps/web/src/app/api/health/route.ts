import { createHash } from 'node:crypto';
import { describeDatabase } from '@openrive/db';
import { redisHealth } from '@openrive/auth';
import { env } from '@openrive/shared/env';
import { objectStorageHealth } from '@/lib/server/project-storage';

export const dynamic = 'force-dynamic';

function fingerprint(value: string | undefined): string | undefined {
  return value ? createHash('sha256').update(value).digest('hex').slice(0, 16) : undefined;
}

/** Liveness + database check (no access token required; reveals only the backend name). */
export async function GET() {
  try {
    const [{ backend }, redis, objectStorage] = await Promise.all([describeDatabase(), redisHealth(), objectStorageHealth()]);
    return Response.json({ ok: true, storage: backend, edition: env().OPENRIVE_EDITION, redis, objectStorage });
  } catch (e) {
    const settings = env();
    console.error('[health]', e, {
      edition: settings.OPENRIVE_EDITION,
      storageEndpoint: settings.OPENRIVE_STORAGE_ENDPOINT,
      storageBucket: settings.OPENRIVE_STORAGE_BUCKET,
      storageRegion: settings.OPENRIVE_STORAGE_REGION,
      storageForcePathStyle: settings.OPENRIVE_STORAGE_FORCE_PATH_STYLE,
      storageAccessKeyFingerprint: fingerprint(settings.OPENRIVE_STORAGE_ACCESS_KEY_ID),
      storageSecretFingerprint: fingerprint(settings.OPENRIVE_STORAGE_SECRET_ACCESS_KEY),
    });
    return Response.json({ ok: false, storage: 'unknown' }, { status: 503 });
  }
}
