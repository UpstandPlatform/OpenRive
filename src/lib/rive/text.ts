// Rive text: a FontAsset (with embedded font bytes) at file level, and per text
// object:  Text -> TextStylePaint (fontAssetId, fontSize) -> Fill -> SolidColor
//               -> TextValueRun (styleId, text)
import { ArtboardDoc, CoreObj, RiveDoc } from './document';
import { obj } from './factory';
import { prop } from './scene';
import { isA } from './schema';

export const DEFAULT_FONT = { name: 'Inter', url: '/fonts/Inter-Regular.ttf' };
export const BUNDLED_FONTS = [
  { name: 'Inter', url: '/fonts/Inter-Regular.ttf', file: 'Inter-Regular.ttf' },
  { name: 'Inter Bold', url: '/fonts/Inter-Bold.ttf', file: 'Inter-Bold.ttf' },
];

export function fontAssets(doc: RiveDoc): CoreObj[] {
  return doc.top.filter((o) => o.type === 'FontAsset');
}

/** Returns the FontAsset with this name, embedding the font bytes if it doesn't exist yet. */
export function ensureFontAsset(doc: RiveDoc, name: string, bytes: Uint8Array): string {
  const existing = fontAssets(doc).find((a) => a.props.name === name);
  if (existing) return existing.id;
  const asset = obj('FontAsset', { name, assetId: Math.floor(Math.random() * 1_000_000) + 1 }, [
    obj('FileAssetContents', { bytes }),
  ]);
  // keep assets before other top-level objects that may reference them
  const lastAsset = doc.top.map((o) => isA(o.type, 'FileAsset')).lastIndexOf(true);
  const backboard = doc.top.findIndex((o) => o.type === 'Backboard');
  doc.top.splice(Math.max(lastAsset, backboard) + 1, 0, asset);
  return asset.id;
}

export interface NewTextOptions {
  parentId: string;
  x: number;
  y: number;
  text: string;
  fontAssetId: string;
  fontSize?: number;
  color?: number;
  name?: string;
  /** fixed width wraps text (auto height); omitted = auto width */
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export function newTextObjects(o: NewTextOptions): CoreObj[] {
  const text = obj('Text', {
    name: o.name ?? 'Text',
    parentId: o.parentId,
    x: o.x,
    y: o.y,
    alignValue: o.align === 'right' ? 1 : o.align === 'center' ? 2 : 0,
    ...(o.width ? { sizingValue: 1, width: o.width } : {}),
  });
  const style = obj('TextStylePaint', { name: 'Style', parentId: text.id, fontSize: o.fontSize ?? 32, fontAssetId: o.fontAssetId });
  const fill = obj('Fill', { name: 'Fill', parentId: style.id });
  const solid = obj('SolidColor', { parentId: fill.id, colorValue: (o.color ?? 0xffffffff) >>> 0 });
  const run = obj('TextValueRun', { name: 'Run', parentId: text.id, styleId: style.id, text: o.text });
  return [text, style, fill, solid, run];
}

export function textRuns(ab: ArtboardDoc, textId: string): CoreObj[] {
  return ab.objects.filter((c) => c.type === 'TextValueRun' && c.props.parentId === textId);
}
export function textStyles(ab: ArtboardDoc, textId: string): CoreObj[] {
  return ab.objects.filter((c) => isA(c.type, 'TextStyle') && c.props.parentId === textId);
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number): number {
  if (typeof document !== 'undefined') {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    if (measureCtx) {
      measureCtx.font = `${size}px Inter, sans-serif`;
      return measureCtx.measureText(text).width;
    }
  }
  return text.length * size * 0.55;
}

/** Approximate layout box of a Text object in its local space (used for selection only). */
export function textBox(ab: ArtboardDoc, t: CoreObj, overrides?: Map<string, Record<string, unknown>>) {
  const runs = textRuns(ab, t.id);
  const styles = new Map(textStyles(ab, t.id).map((s) => [s.id, s]));
  let size = 12;
  for (const r of runs) {
    const st = typeof r.props.styleId === 'string' ? styles.get(r.props.styleId) : undefined;
    if (st) size = Math.max(size, prop(st, 'fontSize', overrides));
  }
  const full = runs.map((r) => String(r.props.text ?? '')).join('');
  const lineH = size * 1.21;
  const sizing = prop(t, 'sizingValue', overrides);
  let w: number;
  let lines: number;
  if (sizing === 0) {
    const ls = full.split('\n');
    w = Math.max(1, ...ls.map((l) => measure(l, size)));
    lines = ls.length;
  } else {
    w = prop(t, 'width', overrides) || 100;
    // rough wrap estimate
    lines = full.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(measure(l, size) / w)), 0);
  }
  const h = sizing === 2 ? prop(t, 'height', overrides) || lineH : lines * lineH;
  const ox = -prop(t, 'originX', overrides) * w;
  const oy = -prop(t, 'originY', overrides) * h;
  return { x: ox, y: oy, w, h, fontSize: size };
}
