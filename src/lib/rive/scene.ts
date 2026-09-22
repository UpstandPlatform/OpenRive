// Editor-side evaluation of an artboard: animation sampling, world transforms
// and path geometry. Rendering itself is done by the official Rive runtime;
// this is used for selection, hit testing, handles and the inspector.
import { ArtboardDoc, CoreObj } from './document';
import { defaultValue, isA, propDefByKey } from './schema';
import { textBox } from './text';

// ---------------------------------------------------------------------------
// 2D affine matrices: [a, b, c, d, e, f]  x' = a*x + c*y + e, y' = b*x + d*y + f

export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [...IDENTITY];
  const id = 1 / det;
  return [
    m[3] * id,
    -m[1] * id,
    -m[2] * id,
    m[0] * id,
    (m[2] * m[5] - m[3] * m[4]) * id,
    (m[1] * m[4] - m[0] * m[5]) * id,
  ];
}
export function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function compose(x: number, y: number, rotation: number, sx: number, sy: number): Mat {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}
export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];

// ---------------------------------------------------------------------------
// Property access

export type Overrides = Map<string, Record<string, unknown>>;

export function prop<T = number>(o: CoreObj, name: string, overrides?: Overrides): T {
  const ov = overrides?.get(o.id);
  if (ov && name in ov) return ov[name] as T;
  const v = o.props[name];
  if (v !== undefined && v !== null) return v as T;
  return defaultValue(o.type, name) as T;
}

/**
 * Stage position of an artboard. Rive files don't store where artboards sit
 * on the editor stage, so this lives in editor-only `ui` data (falling back to
 * the editor-only xArtboard/yArtboard properties if a file has them).
 */
export function artboardPos(artboard: CoreObj): { x: number; y: number } {
  const ui = artboard.ui ?? {};
  return {
    x: typeof ui.x === 'number' ? ui.x : prop(artboard, 'xArtboard'),
    y: typeof ui.y === 'number' ? ui.y : prop(artboard, 'yArtboard'),
  };
}
export function setArtboardPos(artboard: CoreObj, x: number, y: number) {
  artboard.ui = { ...artboard.ui, x, y };
}

// ---------------------------------------------------------------------------
// Animation sampling

function cubicBezierEase(x1: number, y1: number, x2: number, y2: number, t: number): number {
  // Solve x(u) = t with Newton + bisection fallback, then return y(u).
  const bx = (u: number) => 3 * u * (1 - u) * (1 - u) * x1 + 3 * u * u * (1 - u) * x2 + u * u * u;
  const by = (u: number) => 3 * u * (1 - u) * (1 - u) * y1 + 3 * u * u * (1 - u) * y2 + u * u * u;
  const dx = (u: number) => 3 * (1 - u) * (1 - u) * x1 + 6 * u * (1 - u) * (x2 - x1) + 3 * u * u * (1 - x2);
  let u = t;
  for (let i = 0; i < 8; i++) {
    const err = bx(u) - t;
    if (Math.abs(err) < 1e-6) return by(u);
    const d = dx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= err / d;
  }
  let lo = 0;
  let hi = 1;
  u = t;
  for (let i = 0; i < 30; i++) {
    const x = bx(u);
    if (Math.abs(x - t) < 1e-6) break;
    if (x < t) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return by(u);
}

function lerpColor(a: number, b: number, f: number): number {
  const ch = (v: number, s: number) => (v >>> s) & 255;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * f) & 255;
  return ((mix(24) << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)) >>> 0;
}

export function easeFactor(ab: ArtboardDoc, kf: CoreObj, f: number): number {
  const type = prop(kf, 'interpolationType');
  if (type === 0) return 0;
  const interpId = kf.props.interpolatorId;
  if (typeof interpId === 'string') {
    const interp = ab.objects.find((o) => o.id === interpId);
    if (interp && isA(interp.type, 'CubicInterpolator')) {
      return cubicBezierEase(prop(interp, 'x1'), prop(interp, 'y1'), prop(interp, 'x2'), prop(interp, 'y2'), f);
    }
  }
  return f;
}

/** Value of a keyed property at a frame. */
export function sampleKeyframes(ab: ArtboardDoc, keyframes: CoreObj[], frame: number): unknown {
  if (!keyframes.length) return undefined;
  const kfs = [...keyframes].sort((a, b) => prop(a, 'frame') - prop(b, 'frame'));
  if (frame <= prop(kfs[0], 'frame')) return kfs[0].props.value ?? defaultValue(kfs[0].type, 'value');
  for (let i = 1; i < kfs.length; i++) {
    const to = kfs[i];
    const toFrame = prop(to, 'frame');
    if (frame < toFrame) {
      const from = kfs[i - 1];
      const fromFrame = prop(from, 'frame');
      const fromV = from.props.value ?? defaultValue(from.type, 'value');
      const toV = to.props.value ?? defaultValue(to.type, 'value');
      if (prop(from, 'interpolationType') === 0 || typeof fromV !== 'number') return fromV;
      const f = easeFactor(ab, from, (frame - fromFrame) / (toFrame - fromFrame));
      if (from.type === 'KeyFrameColor') return lerpColor(fromV, toV as number, f);
      return fromV + ((toV as number) - fromV) * f;
    }
    if (frame === toFrame) return to.props.value ?? defaultValue(to.type, 'value');
  }
  const last = kfs[kfs.length - 1];
  return last.props.value ?? defaultValue(last.type, 'value');
}

export function sampleAnimation(ab: ArtboardDoc, anim: CoreObj | undefined, frame: number): Overrides {
  const out: Overrides = new Map();
  if (!anim) return out;
  for (const ko of anim.children ?? []) {
    if (ko.type !== 'KeyedObject') continue;
    const target = ko.props.objectId;
    if (typeof target !== 'string') continue;
    const rec: Record<string, unknown> = out.get(target) ?? {};
    for (const kp of ko.children ?? []) {
      const pd = propDefByKey(prop(kp, 'propertyKey'));
      if (!pd) continue;
      const v = sampleKeyframes(ab, kp.children ?? [], frame);
      if (v !== undefined) rec[pd.name] = v;
    }
    out.set(target, rec);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scene graph

export interface SceneNode {
  obj: CoreObj;
  parent: string | null;
  children: CoreObj[];
  world: Mat;
}

export interface Scene {
  ab: ArtboardDoc;
  nodes: Map<string, SceneNode>;
  overrides: Overrides;
  /** offset of the artboard origin from its top-left corner; world matrices include it */
  originOffset: [number, number];
}

export function parentOf(o: CoreObj, ab: ArtboardDoc): string | null {
  if (!isA(o.type, 'Component')) return null;
  const p = o.props.parentId;
  if (typeof p === 'string') return p;
  return ab.artboard.id;
}

export function localMatrix(o: CoreObj, overrides?: Overrides): Mat {
  if (o.type === 'Artboard' || !isA(o.type, 'TransformComponent')) {
    if (isA(o.type, 'Vertex') || !isA(o.type, 'WorldTransformComponent')) return [...IDENTITY];
    return [...IDENTITY];
  }
  const isNode = isA(o.type, 'Node');
  const x = isNode ? prop(o, 'x', overrides) : 0;
  const y = isNode ? prop(o, 'y', overrides) : 0;
  return compose(x, y, prop(o, 'rotation', overrides), prop(o, 'scaleX', overrides), prop(o, 'scaleY', overrides));
}

// Image asset sizes (keyed by the ImageAsset's object id). Image components only
// reference their asset, which lives at file level, so the editor registers the
// sizes whenever the document changes.
const imageSizeRegistry = new Map<string, { w: number; h: number }>();
export function registerImageSizes(sizes: Map<string, { w: number; h: number }>) {
  for (const [k, v] of sizes) imageSizeRegistry.set(k, v);
}

/** Local-space box of an Image component (its origin is at originX/originY of the image). */
export function imageBox(o: CoreObj, overrides?: Overrides) {
  const size = imageSizeRegistry.get(String(o.props.assetId)) ?? { w: 100, h: 100 };
  const ox = prop(o, 'originX', overrides);
  const oy = prop(o, 'originY', overrides);
  return { x: -ox * size.w, y: -oy * size.h, w: size.w, h: size.h };
}

export function buildScene(ab: ArtboardDoc, overrides: Overrides = new Map()): Scene {
  const nodes = new Map<string, SceneNode>();
  const w = prop(ab.artboard, 'width', overrides);
  const h = prop(ab.artboard, 'height', overrides);
  const originOffset: [number, number] = [
    prop(ab.artboard, 'originX', overrides) * w,
    prop(ab.artboard, 'originY', overrides) * h,
  ];
  nodes.set(ab.artboard.id, { obj: ab.artboard, parent: null, children: [], world: translate(...originOffset) });
  for (const o of ab.objects) {
    nodes.set(o.id, { obj: o, parent: parentOf(o, ab), children: [], world: IDENTITY });
  }
  for (const o of ab.objects) {
    const n = nodes.get(o.id)!;
    if (n.parent && nodes.has(n.parent)) nodes.get(n.parent)!.children.push(o);
  }
  const done = new Set<string>([ab.artboard.id]);
  const resolveWorld = (id: string, depth = 0): Mat => {
    const n = nodes.get(id)!;
    if (done.has(id) || depth > 200) return n.world;
    const parentWorld = n.parent && nodes.has(n.parent) ? resolveWorld(n.parent, depth + 1) : nodes.get(ab.artboard.id)!.world;
    n.world = mul(parentWorld, localMatrix(n.obj, overrides));
    done.add(id);
    return n.world;
  };
  for (const o of ab.objects) resolveWorld(o.id);
  return { ab, nodes, overrides, originOffset };
}

// ---------------------------------------------------------------------------
// Path geometry (in the path's local space)

const KAPPA = 0.5522847498;

export interface PathGeom {
  d: string;
  points: [number, number][]; // vertices and control points, for bounds
}

function fmt(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function vertexControls(v: CoreObj, ov?: Overrides) {
  const x = prop(v, 'x', ov);
  const y = prop(v, 'y', ov);
  switch (v.type) {
    case 'CubicMirroredVertex': {
      const r = prop(v, 'rotation', ov);
      const d = prop(v, 'distance', ov);
      return { x, y, in: [x - Math.cos(r) * d, y - Math.sin(r) * d], out: [x + Math.cos(r) * d, y + Math.sin(r) * d] };
    }
    case 'CubicAsymmetricVertex': {
      const r = prop(v, 'rotation', ov);
      return {
        x,
        y,
        in: [x - Math.cos(r) * prop(v, 'inDistance', ov), y - Math.sin(r) * prop(v, 'inDistance', ov)],
        out: [x + Math.cos(r) * prop(v, 'outDistance', ov), y + Math.sin(r) * prop(v, 'outDistance', ov)],
      };
    }
    case 'CubicDetachedVertex': {
      const ir = prop(v, 'inRotation', ov);
      const id = prop(v, 'inDistance', ov);
      const or = prop(v, 'outRotation', ov);
      const od = prop(v, 'outDistance', ov);
      return { x, y, in: [x + Math.cos(ir) * id, y + Math.sin(ir) * id], out: [x + Math.cos(or) * od, y + Math.sin(or) * od] };
    }
    default:
      return { x, y, in: null, out: null } as { x: number; y: number; in: number[] | null; out: number[] | null };
  }
}

export function pathGeometry(path: CoreObj, scene: Scene): PathGeom {
  const ov = scene.overrides;
  const t = path.type;
  if (isA(t, 'ParametricPath')) {
    const w = prop(path, 'width', ov);
    const h = prop(path, 'height', ov);
    const ox = -prop(path, 'originX', ov) * w;
    const oy = -prop(path, 'originY', ov) * h;
    const box: [number, number][] = [
      [ox, oy],
      [ox + w, oy + h],
    ];
    if (t === 'Rectangle') {
      const linked = prop<boolean>(path, 'linkCornerRadius', ov);
      const tl = prop(path, 'cornerRadiusTL', ov);
      const clampR = (r: number) => Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
      const [rtl, rtr, rbr, rbl] = (
        linked ? [tl, tl, tl, tl] : [tl, prop(path, 'cornerRadiusTR', ov), prop(path, 'cornerRadiusBR', ov), prop(path, 'cornerRadiusBL', ov)]
      ).map(clampR);
      const x0 = ox, y0 = oy, x1 = ox + w, y1 = oy + h;
      const d =
        `M${fmt(x0 + rtl)} ${fmt(y0)}L${fmt(x1 - rtr)} ${fmt(y0)}` +
        (rtr ? `A${fmt(rtr)} ${fmt(rtr)} 0 0 1 ${fmt(x1)} ${fmt(y0 + rtr)}` : '') +
        `L${fmt(x1)} ${fmt(y1 - rbr)}` +
        (rbr ? `A${fmt(rbr)} ${fmt(rbr)} 0 0 1 ${fmt(x1 - rbr)} ${fmt(y1)}` : '') +
        `L${fmt(x0 + rbl)} ${fmt(y1)}` +
        (rbl ? `A${fmt(rbl)} ${fmt(rbl)} 0 0 1 ${fmt(x0)} ${fmt(y1 - rbl)}` : '') +
        `L${fmt(x0)} ${fmt(y0 + rtl)}` +
        (rtl ? `A${fmt(rtl)} ${fmt(rtl)} 0 0 1 ${fmt(x0 + rtl)} ${fmt(y0)}` : '') +
        'Z';
      return { d, points: box };
    }
    if (t === 'Ellipse') {
      const rx = w / 2, ry = h / 2;
      const cx = ox + rx, cy = oy + ry;
      const kx = rx * KAPPA, ky = ry * KAPPA;
      const d =
        `M${fmt(cx)} ${fmt(cy - ry)}` +
        `C${fmt(cx + kx)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - ky)} ${fmt(cx + rx)} ${fmt(cy)}` +
        `C${fmt(cx + rx)} ${fmt(cy + ky)} ${fmt(cx + kx)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)}` +
        `C${fmt(cx - kx)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + ky)} ${fmt(cx - rx)} ${fmt(cy)}` +
        `C${fmt(cx - rx)} ${fmt(cy - ky)} ${fmt(cx - kx)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)}Z`;
      return { d, points: box };
    }
    if (t === 'Triangle') {
      const pts: [number, number][] = [
        [ox + w / 2, oy],
        [ox + w, oy + h],
        [ox, oy + h],
      ];
      return { d: `M${pts.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join('L')}Z`, points: box };
    }
    if (t === 'Polygon' || t === 'Star') {
      const n = Math.max(3, prop(path, 'points', ov));
      const rx = w / 2, ry = h / 2;
      const cx = ox + rx, cy = oy + ry;
      const pts: [number, number][] = [];
      if (t === 'Star') {
        const inner = prop(path, 'innerRadius', ov);
        for (let i = 0; i < n * 2; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / n;
          const f = i % 2 ? inner : 1;
          pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
        }
      } else {
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
        }
      }
      return { d: `M${pts.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join('L')}Z`, points: box };
    }
    return { d: `M${ox} ${oy}h${w}v${h}h${-w}Z`, points: box };
  }
  // Points path
  const node = scene.nodes.get(path.id);
  const verts = (node?.children ?? []).filter((c) => isA(c.type, 'PathVertex'));
  if (!verts.length) return { d: '', points: [] };
  const vs = verts.map((v) => vertexControls(v, ov));
  const points: [number, number][] = [];
  let d = `M${fmt(vs[0].x)} ${fmt(vs[0].y)}`;
  points.push([vs[0].x, vs[0].y]);
  const seg = (a: (typeof vs)[number], b: (typeof vs)[number]) => {
    if (a.out || b.in) {
      const c1 = a.out ?? [a.x, a.y];
      const c2 = b.in ?? [b.x, b.y];
      points.push([c1[0], c1[1]], [c2[0], c2[1]]);
      return `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(b.x)} ${fmt(b.y)}`;
    }
    return `L${fmt(b.x)} ${fmt(b.y)}`;
  };
  for (let i = 1; i < vs.length; i++) {
    d += seg(vs[i - 1], vs[i]);
    points.push([vs[i].x, vs[i].y]);
  }
  if (prop<boolean>(path, 'isClosed', ov)) {
    d += seg(vs[vs.length - 1], vs[0]) + 'Z';
  }
  return { d, points };
}

export function pathsOfShape(scene: Scene, shapeId: string): CoreObj[] {
  const out: CoreObj[] = [];
  const walk = (id: string) => {
    for (const c of scene.nodes.get(id)?.children ?? []) {
      if (isA(c.type, 'Path')) out.push(c);
      // paths can be nested in nodes inside a shape
      if (c.type === 'Node' || isA(c.type, 'Path')) walk(c.id);
    }
  };
  walk(shapeId);
  return out;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const emptyBounds = (): Bounds => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
export const addPoint = (b: Bounds, x: number, y: number) => {
  b.minX = Math.min(b.minX, x);
  b.minY = Math.min(b.minY, y);
  b.maxX = Math.max(b.maxX, x);
  b.maxY = Math.max(b.maxY, y);
};
export const isEmpty = (b: Bounds) => !isFinite(b.minX);

/** Bounds of a component (in the space given by `toSpace`, default artboard space: top-left = 0,0). */
export function objectBounds(scene: Scene, id: string, toSpace: Mat = IDENTITY): Bounds {
  const b = emptyBounds();
  const node = scene.nodes.get(id);
  if (!node) return b;
  const addPath = (p: CoreObj) => {
    const g = pathGeometry(p, scene);
    const m = mul(toSpace, scene.nodes.get(p.id)!.world);
    for (const [x, y] of g.points) addPoint(b, ...apply(m, x, y));
  };
  const visit = (o: CoreObj) => {
    if (isA(o.type, 'Path')) addPath(o);
    if (o.type === 'Text' || o.type === 'Image') {
      const t = o.type === 'Text' ? textBox(scene.ab, o, scene.overrides) : imageBox(o, scene.overrides);
      const m = mul(toSpace, scene.nodes.get(o.id)!.world);
      for (const [x, y] of [
        [t.x, t.y],
        [t.x + t.w, t.y],
        [t.x + t.w, t.y + t.h],
        [t.x, t.y + t.h],
      ])
        addPoint(b, ...apply(m, x, y));
    }
    for (const c of scene.nodes.get(o.id)?.children ?? []) visit(c);
  };
  if (node.obj.type === 'Artboard') {
    const w = prop(node.obj, 'width', scene.overrides);
    const h = prop(node.obj, 'height', scene.overrides);
    addPoint(b, ...apply(toSpace, 0, 0));
    addPoint(b, ...apply(toSpace, w, h));
    return b;
  }
  visit(node.obj);
  if (isEmpty(b) && isA(node.obj.type, 'Node')) {
    // empty group: use its origin
    const [x, y] = apply(mul(toSpace, node.world), 0, 0);
    addPoint(b, x, y);
  }
  return b;
}

/** Draw order: front-most first (runtime draws earlier objects on top). */
export function drawablesFrontToBack(scene: Scene): CoreObj[] {
  const out: CoreObj[] = [];
  const walk = (id: string) => {
    for (const c of scene.nodes.get(id)?.children ?? []) {
      if (isA(c.type, 'Drawable') && c.type !== 'Artboard') out.push(c);
      walk(c.id);
    }
  };
  walk(scene.ab.artboard.id);
  return out;
}

let hitCtx: CanvasRenderingContext2D | null = null;
function getHitCtx() {
  if (!hitCtx && typeof document !== 'undefined') {
    hitCtx = document.createElement('canvas').getContext('2d');
  }
  return hitCtx;
}

/** Returns the id of the top-most Shape under a point (artboard space: top-left = 0,0). */
export function hitTestShape(scene: Scene, x: number, y: number, tolerance = 4): string | null {
  const ctx = getHitCtx();
  if (!ctx) return null;
  for (const d of drawablesFrontToBack(scene)) {
    if (d.type !== 'Shape' && d.type !== 'Text' && d.type !== 'Image') continue;
    if (isHidden(scene, d.id) || isLocked(scene, d.id)) continue;
    if (d.type === 'Text' || d.type === 'Image') {
      const t = d.type === 'Text' ? textBox(scene.ab, d, scene.overrides) : imageBox(d, scene.overrides);
      const [lx, ly] = apply(invert(scene.nodes.get(d.id)!.world), x, y);
      if (lx >= t.x && lx <= t.x + t.w && ly >= t.y && ly <= t.y + t.h) return d.id;
      continue;
    }
    const hasStroke = (scene.nodes.get(d.id)?.children ?? []).some((c) => c.type === 'Stroke');
    for (const p of pathsOfShape(scene, d.id)) {
      const g = pathGeometry(p, scene);
      if (!g.d) continue;
      const world = scene.nodes.get(p.id)!.world;
      const inv = invert(world);
      const [lx, ly] = apply(inv, x, y);
      const path2d = new Path2D(g.d);
      if (ctx.isPointInPath(path2d, lx, ly)) return d.id;
      const scale = Math.sqrt(Math.abs(world[0] * world[3] - world[1] * world[2])) || 1;
      ctx.lineWidth = (tolerance * 2) / scale + (hasStroke ? 4 : 0);
      if (ctx.isPointInStroke(path2d, lx, ly)) return d.id;
    }
  }
  return null;
}

export function isHidden(scene: Scene, id: string): boolean {
  // Drawables hidden via the editor's collapse/hide flag (drawableFlags bit 0)
  let cur: string | null = id;
  let guard = 0;
  while (cur && guard++ < 100) {
    const n = scene.nodes.get(cur);
    if (!n) return false;
    if (isA(n.obj.type, 'Drawable') && n.obj.type !== 'Artboard' && (prop(n.obj, 'drawableFlags', scene.overrides) & 1)) return true;
    cur = n.parent;
  }
  return false;
}

export function isLocked(scene: Scene, id: string): boolean {
  // editor-only lock flag (drawableFlags bit 1), inherited from ancestors
  let cur: string | null = id;
  let guard = 0;
  while (cur && guard++ < 100) {
    const n = scene.nodes.get(cur);
    if (!n) return false;
    if (isA(n.obj.type, 'Drawable') && n.obj.type !== 'Artboard' && prop(n.obj, 'drawableFlags', scene.overrides) & 2) return true;
    cur = n.parent;
  }
  return false;
}
