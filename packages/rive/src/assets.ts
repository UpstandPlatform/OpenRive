// File assets (embedded images and fonts) and placing images on artboards.
import { ArtboardDoc, CoreObj, RiveDoc } from './document';
import { obj } from './factory';
import { insertObjects } from './ops';
import { isA } from './schema';

export type AssetKind = 'image' | 'font' | 'audio' | 'other';

export function assetKind(o: CoreObj): AssetKind {
  if (o.type === 'ImageAsset') return 'image';
  if (o.type === 'FontAsset') return 'font';
  if (o.type === 'AudioAsset') return 'audio';
  return 'other';
}

export function fileAssets(doc: RiveDoc): CoreObj[] {
  return doc.top.filter((o) => isA(o.type, 'FileAsset'));
}

export function assetBytes(a: CoreObj): Uint8Array | undefined {
  const c = a.children?.find((x) => x.type === 'FileAssetContents');
  return c?.props.bytes instanceof Uint8Array ? c.props.bytes : undefined;
}

/** True when the asset's data is not embedded (e.g. hosted on Rive's CDN). */
export function isReferenced(a: CoreObj): boolean {
  return !assetBytes(a);
}

function insertAsset(doc: RiveDoc, asset: CoreObj) {
  const lastAsset = doc.top.map((o) => isA(o.type, 'FileAsset')).lastIndexOf(true);
  const backboard = doc.top.findIndex((o) => o.type === 'Backboard');
  doc.top.splice(Math.max(lastAsset, backboard) + 1, 0, asset);
}

const newAssetId = () => Math.floor(Math.random() * 1_000_000_000) + 1;

export function addImageAsset(doc: RiveDoc, name: string, bytes: Uint8Array, width: number, height: number): CoreObj {
  const asset = obj('ImageAsset', { name, assetId: newAssetId(), width, height }, [obj('FileAssetContents', { bytes })]);
  insertAsset(doc, asset);
  return asset;
}

export function addFontAsset(doc: RiveDoc, name: string, bytes: Uint8Array): CoreObj {
  const asset = obj('FontAsset', { name, assetId: newAssetId() }, [obj('FileAssetContents', { bytes })]);
  insertAsset(doc, asset);
  return asset;
}

/** Places an Image of the asset (centered at x,y in parent space). */
export function placeImage(ab: ArtboardDoc, asset: CoreObj, x: number, y: number, parentId?: string, maxSize?: number): CoreObj {
  const w = Number(asset.props.width) || 100;
  const h = Number(asset.props.height) || 100;
  const fit = maxSize && Math.max(w, h) > maxSize ? maxSize / Math.max(w, h) : 1;
  const image = obj('Image', {
    name: String(asset.props.name || 'Image'),
    parentId: parentId ?? ab.artboard.id,
    assetId: asset.id,
    x,
    y,
    ...(fit !== 1 ? { scaleX: fit, scaleY: fit } : {}),
  });
  insertObjects(ab, [image]);
  return image;
}

/** Objects that use an asset (images, text styles, audio events). */
export function assetUsers(doc: RiveDoc, assetId: string): { ab: ArtboardDoc; o: CoreObj }[] {
  const out: { ab: ArtboardDoc; o: CoreObj }[] = [];
  for (const ab of doc.artboards)
    for (const o of ab.objects) if (o.props.assetId === assetId || o.props.fontAssetId === assetId) out.push({ ab, o });
  return out;
}

/** Removes an asset and every Image using it. Fonts in use are kept (returns false). */
export function removeAsset(doc: RiveDoc, assetId: string): boolean {
  const asset = doc.top.find((o) => o.id === assetId);
  if (!asset) return false;
  const users = assetUsers(doc, assetId);
  if (users.some((u) => u.o.props.fontAssetId === assetId)) return false;
  for (const ab of doc.artboards) {
    const doomed = new Set(ab.objects.filter((o) => o.props.assetId === assetId).map((o) => o.id));
    ab.objects = ab.objects.filter((o) => !doomed.has(o.id));
    for (const a of ab.animations) a.children = (a.children ?? []).filter((ko) => !doomed.has(ko.props.objectId as string));
  }
  doc.top = doc.top.filter((o) => o.id !== assetId);
  return true;
}

/** Sizes of image assets, used by the editor for selection bounds. */
export function imageSizes(doc: RiveDoc): Map<string, { w: number; h: number }> {
  const m = new Map<string, { w: number; h: number }>();
  for (const a of doc.top) if (a.type === 'ImageAsset') m.set(a.id, { w: Number(a.props.width) || 0, h: Number(a.props.height) || 0 });
  return m;
}

export function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
}
