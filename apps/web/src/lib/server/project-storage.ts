import { getProjectAsset, updateProject } from '@openrive/db';
import { env } from '@openrive/shared/env';
import { createObjectStorage, legacyProjectRivKey, projectRivKey, type ObjectStorage } from '@openrive/storage';

let storageInstance: Promise<ObjectStorage> | null = null;

export const cloudEdition = () => env().OPENRIVE_EDITION === 'cloud';

async function objectStorage(): Promise<ObjectStorage> {
  return (storageInstance ??= Promise.resolve().then(() => createObjectStorage()));
}

export async function readProjectRiv(id: string): Promise<Uint8Array | null> {
  const asset = await getProjectAsset(id);
  if (!asset) return null;
  if (asset.riv) {
    if (!cloudEdition()) return asset.riv;
    // Existing self-hosted rows can be adopted by cloud without a separate
    // operator migration. The deterministic key also makes concurrent reads safe.
    const key = legacyProjectRivKey(id);
    await (await objectStorage()).put(key, asset.riv, 'application/octet-stream');
    await pointProjectRiv(id, key);
    return asset.riv;
  }
  if (!asset.rivStorageKey) return null;
  return (await objectStorage()).get(asset.rivStorageKey);
}

/** Uploads a new object before the caller changes the database pointer. */
export async function uploadProjectRiv(id: string, bytes: Uint8Array): Promise<string> {
  const key = projectRivKey(id);
  await (await objectStorage()).put(key, bytes, 'application/octet-stream');
  return key;
}

export async function pointProjectRiv(id: string, key: string): Promise<void> {
  const updated = await updateProject(id, { riv: null, rivStorageKey: key });
  if (!updated) throw new Error('Project disappeared while saving its file');
}

/** Cleanup is deliberately best effort after the database pointer is safe. */
export async function removeProjectRiv(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await (await objectStorage()).delete(key);
  } catch (error) {
    console.error('Could not remove an old OpenRive object', error instanceof Error ? error.message : error);
  }
}

export async function objectStorageHealth(): Promise<'disabled' | 'ready'> {
  if (!cloudEdition()) return 'disabled';
  await (await objectStorage()).health();
  return 'ready';
}
