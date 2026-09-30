'use client';
import { exportRiv, RiveDoc } from '@openrive/rive/document';
import { newDoc } from '@openrive/rive/factory';
import { stringifyDoc, toBase64 } from '@openrive/shared/serialize';
import type { ProjectMeta } from '@openrive/shared';
import { api } from './session';

export function docStats(doc: RiveDoc) {
  return {
    artboards: doc.artboards.length,
    animations: doc.artboards.reduce((n, a) => n + a.animations.length, 0),
    stateMachines: doc.artboards.reduce((n, a) => n + a.stateMachines.length, 0),
  };
}

export async function createProjectFromDoc(name: string, ownerId: string, doc: RiveDoc) {
  return api.json<ProjectMeta>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, ownerId, doc: stringifyDoc(doc), riv: toBase64(exportRiv(doc)), ...docStats(doc) }),
  });
}

export async function createBlankProject(ownerId: string, name = 'Untitled') {
  return createProjectFromDoc(name, ownerId, newDoc('Artboard'));
}

export async function importRivFile(file: File) {
  const form = new FormData();
  form.set('file', file, file.name);
  const res = await fetch('/api/projects/import', { method: 'POST', body: form, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Import failed (${res.status})`);
  return data as ProjectMeta;
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
