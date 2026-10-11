/** Portable, Git-friendly OpenRive source archives (.oriv). */
import { zipSync, unzipSync } from 'fflate';
import { assetBytes, fileAssets } from './assets';
import type { CoreObj, RiveDoc } from './document';
import { parseDoc, stringifyDoc, toBase64 } from '@openrive/shared/serialize';
import { z } from 'zod';

const FORMAT = 'openrive-source';
const VERSION = 1;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
const MAX_FILES = 10000;
const ASSET_MARKER = '$openriveAsset';

const sourceCoreObjSchema: z.ZodType<Record<string, unknown>> = z.lazy(() => z.object({
  id: z.string(),
  type: z.string(),
  props: z.record(z.string(), z.unknown()),
  children: z.array(sourceCoreObjSchema).optional(),
  raw: z.array(z.unknown()).optional(),
  keyOrder: z.array(z.number().int()).optional(),
  ui: z.record(z.string(), z.unknown()).optional(),
}).passthrough());

const sourceDocumentSchema = z.object({
  header: z.object({ major: z.number().int(), minor: z.number().int(), fileId: z.number().int() }).passthrough(),
  top: z.array(sourceCoreObjSchema),
  artboards: z.array(z.object({
    id: z.string(),
    artboard: sourceCoreObjSchema,
    objects: z.array(sourceCoreObjSchema),
    animations: z.array(sourceCoreObjSchema),
    stateMachines: z.array(sourceCoreObjSchema),
  }).passthrough()),
  editor: z.unknown().optional(),
}).passthrough();
const sourceManifestSchema = z.object({ format: z.string(), version: z.number().int(), document: z.unknown() }).passthrough();

function safeName(value: unknown): string {
  const name = String(value ?? 'asset').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/\.{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return name || 'asset';
}

function unsafePath(path: string): boolean {
  return path.startsWith('/') || path.includes('\\') || path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function walk(o: CoreObj, visit: (o: CoreObj) => void) {
  visit(o);
  for (const child of o.children ?? []) walk(child, visit);
}

/** Create a folder's reviewable files: JSON source plus one binary file per embedded asset. */
export function exportSourceFiles(doc: RiveDoc): Record<string, Uint8Array> {
  const json = JSON.parse(stringifyDoc(doc)) as RiveDoc;
  const files: Record<string, Uint8Array> = {};
  let unpackedBytes = 0;
  let assetIndex = 0;
  for (const original of fileAssets(doc)) {
    const bytes = assetBytes(original);
    if (!bytes) continue;
    if (assetIndex >= MAX_FILES - 1) throw new Error(`OpenRive source contains too many assets (maximum ${MAX_FILES - 1})`);
    unpackedBytes += bytes.length;
    if (unpackedBytes > MAX_UNPACKED_BYTES) throw new Error('OpenRive source exceeds 512 MB unpacked');
    const path = `assets/${String(++assetIndex).padStart(4, '0')}-${safeName(original.props.name)}.bin`;
    files[path] = bytes;
    const clone = json.top.find((o) => o.id === original.id);
    const contents = clone?.children?.find((o) => o.type === 'FileAssetContents');
    if (contents) contents.props.bytes = { [ASSET_MARKER]: path };
  }
  const manifest = new TextEncoder().encode(JSON.stringify({ format: FORMAT, version: VERSION, document: json }, null, 2));
  unpackedBytes += manifest.length;
  if (unpackedBytes > MAX_UNPACKED_BYTES) throw new Error('OpenRive source exceeds 512 MB unpacked');
  files['openrive.json'] = manifest;
  return files;
}

/** Pack a folder source tree into a convenient .oriv archive. */
export function exportSource(doc: RiveDoc): Uint8Array {
  const archive = zipSync(exportSourceFiles(doc), { level: 6 });
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('OpenRive source archive exceeds 128 MB compressed');
  return archive;
}

/** Read the folder representation. Only the manifest and assets directory are valid. */
export function importSourceFiles(files: Record<string, Uint8Array>): RiveDoc {
  if (!files || typeof files !== 'object') throw new Error('OpenRive source files must be a file map');
  const paths = Object.keys(files);
  if (paths.length > MAX_FILES) throw new Error('OpenRive source archive contains too many files');
  let unpacked = 0;
  for (const [path, data] of Object.entries(files)) {
    unpacked += data.length;
    if (unpacked > MAX_UNPACKED_BYTES) throw new Error('OpenRive source exceeds 512 MB unpacked');
    if (unsafePath(path)) throw new Error(`Unsafe path in OpenRive source archive: ${path}`);
    if (path !== 'openrive.json' && !/^assets\/[^/]+$/.test(path)) throw new Error(`Unexpected file in OpenRive source archive: ${path}`);
  }
  const manifest = files['openrive.json'];
  if (!manifest) throw new Error('OpenRive source archive is missing openrive.json');
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(new TextDecoder().decode(manifest));
  } catch {
    throw new Error('OpenRive source manifest is not valid JSON');
  }
  const manifestResult = sourceManifestSchema.safeParse(rawManifest);
  if (!manifestResult.success) throw new Error('OpenRive source manifest has an invalid envelope');
  const parsed = manifestResult.data;
  if (parsed.format !== FORMAT) throw new Error('This archive is not an OpenRive editable source file');
  if (parsed.version !== VERSION) throw new Error(`Unsupported OpenRive source version: ${String(parsed.version)}`);
  const documentResult = sourceDocumentSchema.safeParse(parsed.document);
  if (!documentResult.success) throw new Error(`OpenRive source manifest has an invalid document: ${documentResult.error.issues[0]?.message ?? 'invalid shape'}`);
  const doc = documentResult.data as unknown as RiveDoc;
  const available = new Set(paths);
  for (const top of doc.top) walk(top, (o) => {
    const raw = o.props?.bytes;
    if (!raw || typeof raw !== 'object' || !(ASSET_MARKER in raw)) return;
    const path = String((raw as Record<string, unknown>)[ASSET_MARKER]);
    if (!path.startsWith('assets/') || !available.has(path)) throw new Error(`OpenRive source asset is missing: ${path}`);
    o.props.bytes = { $bytes: toBase64(files[path]!) };
  });
  try {
    return parseDoc<RiveDoc>(JSON.stringify(doc));
  } catch (error) {
    throw new Error(`OpenRive source document could not be decoded: ${(error as Error).message}`);
  }
}

/** Read a compressed editable source archive. */
export function importSource(bytes: Uint8Array): RiveDoc {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error(`OpenRive source archive exceeds ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB`);
  let files: Record<string, Uint8Array>;
  let entryCount = 0;
  let declaredSize = 0;
  const names = new Set<string>();
  try {
    files = unzipSync(bytes, {
      filter: (entry) => {
        entryCount++;
        if (entryCount > 10000) throw new Error('OpenRive source archive contains too many files');
        if (unsafePath(entry.name)) throw new Error(`Unsafe path in OpenRive source archive: ${entry.name}`);
        if (entry.name !== 'openrive.json' && !/^assets\/[^/]+$/.test(entry.name)) throw new Error(`Unexpected file in OpenRive source archive: ${entry.name}`);
        if (names.has(entry.name)) throw new Error(`Duplicate file in OpenRive source archive: ${entry.name}`);
        names.add(entry.name);
        declaredSize += entry.originalSize;
        if (declaredSize > MAX_UNPACKED_BYTES) throw new Error('OpenRive source exceeds 512 MB unpacked');
        return true;
      },
    });
  } catch (error) {
    throw new Error(`Invalid OpenRive source archive: ${(error as Error).message}`);
  }
  return importSourceFiles(files);
}

export function isOpenRiveSource(bytes: Uint8Array): boolean {
  // ZIP local-file header. Do not decode or inflate untrusted input to sniff it.
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
