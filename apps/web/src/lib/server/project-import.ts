import { createProject, deleteProject, getProjectMeta } from '@openrive/db';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { stringifyDoc } from '@openrive/shared/serialize';
import { cloudEdition, pointProjectRiv, removeProjectRiv, uploadProjectRiv } from './project-storage';

export class InvalidRivError extends Error {
  constructor(message = 'The file is not a valid .riv file') {
    super(message);
    this.name = 'InvalidRivError';
  }
}

function stats(doc: ReturnType<typeof importRiv>) {
  return {
    artboards: doc.artboards.length,
    animations: doc.artboards.reduce((count, artboard) => count + artboard.animations.length, 0),
    stateMachines: doc.artboards.reduce((count, artboard) => count + artboard.stateMachines.length, 0),
  };
}

/**
 * Imports bytes once on the server and commits the document and exported file
 * together. Keeping this transaction at the web boundary means browser,
 * self-hosted, cloud, and desktop imports all use the same storage path.
 */
export async function importProjectBytes(name: string, ownerId: string, bytes: Uint8Array) {
  if (!bytes.length) throw new InvalidRivError('The uploaded .riv file is empty');
  let doc: ReturnType<typeof importRiv>;
  try {
    doc = importRiv(bytes);
  } catch {
    throw new InvalidRivError();
  }
  const riv = exportRiv(doc);
  const meta = await createProject({
    name: name.trim().slice(0, 200) || 'Untitled',
    ownerId,
    doc: stringifyDoc(doc),
    ...stats(doc),
    riv: cloudEdition() ? undefined : riv,
  });

  if (!cloudEdition()) return meta;

  let key: string | undefined;
  try {
    key = await uploadProjectRiv(meta.id, riv);
    await pointProjectRiv(meta.id, key);
    return (await getProjectMeta(meta.id)) ?? meta;
  } catch (error) {
    await deleteProject(meta.id);
    await removeProjectRiv(key);
    throw error;
  }
}
