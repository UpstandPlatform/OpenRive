// SVG → Rive vector import. Works in the browser and in Node (no DOM needed):
// paths (all commands incl. arcs), circles, ellipses, rects, polygons,
// polylines and lines, with group transforms and fill/stroke from attributes,
// inline styles or <style> class rules.
import { ArtboardDoc, CoreObj } from './document';
import { obj, solidFill, solidStroke, vertexFromPen, PenPoint } from './factory';
import { insertObjects } from './ops';
import { compose, Mat, mul, apply, IDENTITY } from './scene';
import { parseColor } from './api';

type Attrs = Record<string, string>;

interface SvgShape {
  kind: 'path' | 'ellipse' | 'rect';
  attrs: Attrs;
  matrix: Mat;
  /** for path: subpaths in SVG user space */
  subpaths?: { points: PenPoint[]; closed: boolean }[];
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

// ---------------------------------------------------------------------------
// tiny tag parser

function parseAttrs(s: string): Attrs {
  const out: Attrs = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = m[3] ?? m[4] ?? '';
  return out;
}

function parseCssClasses(svg: string): Record<string, Attrs> {
  const out: Record<string, Attrs> = {};
  for (const block of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = block[1].replace(/<!\[CDATA\[|\]\]>/g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const decl = parseStyle(rule[2]);
      for (const sel of rule[1].split(',')) {
        const m = sel.trim().match(/^\.([\w-]+)$/);
        if (m) out[m[1]] = { ...(out[m[1]] ?? {}), ...decl };
      }
    }
  }
  return out;
}

function parseStyle(s: string): Attrs {
  const out: Attrs = {};
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function parseTransform(t: string | undefined): Mat {
  let m: Mat = [...IDENTITY];
  if (!t) return m;
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let n: Mat = [...IDENTITY];
    if (fn === 'matrix') n = [a[0], a[1], a[2], a[3], a[4], a[5]];
    else if (fn === 'translate') n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === 'scale') n = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
    else if (fn === 'rotate') {
      const r = ((a[0] ?? 0) * Math.PI) / 180;
      n = compose(0, 0, r, 1, 1);
      if (a.length === 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (fn === 'skewX') n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

// ---------------------------------------------------------------------------
// path data

function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  for (const m of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g)) {
    out.push(m[1] ?? Number(m[2]));
  }
  return out;
}

/** Arc to cubic beziers (SVG spec F.6). Returns control points triples. */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, fa: number, fs: number, x2: number, y2: number) {
  const out: [number, number, number, number, number, number][] = [];
  if (rx === 0 || ry === 0) return out;
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const delta = dt / segs;
  const k = (4 / 3) * Math.tan(delta / 4);
  let t = t1;
  const pt = (a: number) => {
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    return [cos * x - sin * y + cx, sin * x + cos * y + cy];
  };
  for (let i = 0; i < segs; i++) {
    const [ax, ay] = pt(t);
    const [bx, by] = pt(t + delta);
    const d1x = -rx * Math.sin(t);
    const d1y = ry * Math.cos(t);
    const d2x = -rx * Math.sin(t + delta);
    const d2y = ry * Math.cos(t + delta);
    const c1 = [ax + k * (cos * d1x - sin * d1y), ay + k * (sin * d1x + cos * d1y)];
    const c2 = [bx - k * (cos * d2x - sin * d2y), by - k * (sin * d2x + cos * d2y)];
    out.push([c1[0], c1[1], c2[0], c2[1], bx, by]);
    t += delta;
  }
  return out;
}

interface AbsVertex {
  x: number;
  y: number;
  inX?: number;
  inY?: number;
  outX?: number;
  outY?: number;
}

/** Parses path data into subpaths of vertices with absolute control points. */
export function parsePathData(d: string): { verts: AbsVertex[]; closed: boolean }[] {
  const tk = tokenize(d);
  const subs: { verts: AbsVertex[]; closed: boolean }[] = [];
  let cur: { verts: AbsVertex[]; closed: boolean } | null = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let lastCtrl: [number, number] | null = null;
  let lastQuad: [number, number] | null = null;
  let i = 0;
  const num = () => Number(tk[i++]);
  const start = (nx: number, ny: number) => {
    cur = { verts: [{ x: nx, y: ny }], closed: false };
    subs.push(cur);
    sx = nx;
    sy = ny;
  };
  const lineTo = (nx: number, ny: number) => {
    if (!cur) start(x, y);
    cur!.verts.push({ x: nx, y: ny });
  };
  const cubicTo = (c1x: number, c1y: number, c2x: number, c2y: number, nx: number, ny: number) => {
    if (!cur) start(x, y);
    const prev = cur!.verts[cur!.verts.length - 1];
    prev.outX = c1x;
    prev.outY = c1y;
    cur!.verts.push({ x: nx, y: ny, inX: c2x, inY: c2y });
  };
  while (i < tk.length) {
    if (typeof tk[i] === 'string') cmd = tk[i++] as string;
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C === 'Z') {
      if (cur) {
        const c = cur as { verts: AbsVertex[]; closed: boolean };
        c.closed = true;
        // merge a closing point that duplicates the start
        const first = c.verts[0];
        const last = c.verts[c.verts.length - 1];
        if (c.verts.length > 1 && Math.abs(first.x - last.x) < 1e-3 && Math.abs(first.y - last.y) < 1e-3) {
          first.inX = last.inX;
          first.inY = last.inY;
          c.verts.pop();
        }
      }
      x = sx;
      y = sy;
      cur = null;
      lastCtrl = lastQuad = null;
      continue;
    }
    if (typeof tk[i] !== 'number') continue;
    switch (C) {
      case 'M': {
        const nx = num() + ox;
        const ny = num() + oy;
        start(nx, ny);
        x = nx;
        y = ny;
        cmd = rel ? 'l' : 'L'; // implicit lineto for following pairs
        lastCtrl = lastQuad = null;
        break;
      }
      case 'L': {
        x = num() + ox;
        y = num() + oy;
        lineTo(x, y);
        lastCtrl = lastQuad = null;
        break;
      }
      case 'H':
        x = num() + ox;
        lineTo(x, y);
        lastCtrl = lastQuad = null;
        break;
      case 'V':
        y = num() + oy;
        lineTo(x, y);
        lastCtrl = lastQuad = null;
        break;
      case 'C': {
        const c1x = num() + ox, c1y = num() + oy, c2x = num() + ox, c2y = num() + oy;
        x = num() + ox;
        y = num() + oy;
        cubicTo(c1x, c1y, c2x, c2y, x, y);
        lastCtrl = [c2x, c2y];
        lastQuad = null;
        break;
      }
      case 'S': {
        const c1x = lastCtrl ? 2 * x - lastCtrl[0] : x;
        const c1y = lastCtrl ? 2 * y - lastCtrl[1] : y;
        const c2x = num() + ox, c2y = num() + oy;
        x = num() + ox;
        y = num() + oy;
        cubicTo(c1x, c1y, c2x, c2y, x, y);
        lastCtrl = [c2x, c2y];
        lastQuad = null;
        break;
      }
      case 'Q':
      case 'T': {
        let qx: number, qy: number;
        if (C === 'Q') {
          qx = num() + ox;
          qy = num() + oy;
        } else {
          qx = lastQuad ? 2 * x - lastQuad[0] : x;
          qy = lastQuad ? 2 * y - lastQuad[1] : y;
        }
        const nx = num() + ox;
        const ny = num() + oy;
        cubicTo(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny), nx, ny);
        x = nx;
        y = ny;
        lastQuad = [qx, qy];
        lastCtrl = null;
        break;
      }
      case 'A': {
        const rx = num(), ry = num(), rot = num(), fa = num(), fs = num();
        const nx = num() + ox;
        const ny = num() + oy;
        const cubics = arcToCubics(x, y, rx, ry, rot, fa, fs, nx, ny);
        if (!cubics.length) lineTo(nx, ny);
        for (const c of cubics) cubicTo(c[0], c[1], c[2], c[3], c[4], c[5]);
        x = nx;
        y = ny;
        lastCtrl = lastQuad = null;
        break;
      }
      default:
        i++;
    }
  }
  return subs.filter((s) => s.verts.length > 1);
}

// ---------------------------------------------------------------------------

function collectShapes(svg: string): { shapes: SvgShape[]; viewBox: [number, number, number, number] } {
  const classes = parseCssClasses(svg);
  const rootTag = svg.match(/<svg\b([^>]*)>/);
  const rootAttrs = rootTag ? parseAttrs(rootTag[1]) : {};
  let viewBox: [number, number, number, number] = [0, 0, Number(parseFloat(rootAttrs.width ?? '100')), Number(parseFloat(rootAttrs.height ?? '100'))];
  if (rootAttrs.viewBox) {
    const v = rootAttrs.viewBox.split(/[\s,]+/).map(Number);
    if (v.length === 4) viewBox = [v[0], v[1], v[2], v[3]];
  }
  const shapes: SvgShape[] = [];
  const stack: { matrix: Mat; style: Attrs }[] = [{ matrix: [...IDENTITY], style: {} }];
  const body = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<defs[\s\S]*?<\/defs>/g, '');
  for (const m of body.matchAll(/<(\/?)([\w:]+)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, rest, selfClose] = m;
    if (closing) {
      if (tag === 'g' || tag === 'svg') stack.pop();
      continue;
    }
    const a = parseAttrs(rest);
    const top = stack[stack.length - 1];
    const own: Attrs = {};
    for (const k of ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'fill-rule']) if (a[k] !== undefined) own[k] = a[k];
    const style: Attrs = {
      ...top.style,
      ...(a.class ? a.class.split(/\s+/).reduce((acc, c) => ({ ...acc, ...(classes[c] ?? {}) }), {} as Attrs) : {}),
      ...own,
      ...(a.style ? parseStyle(a.style) : {}),
    };
    const matrix = mul(top.matrix, parseTransform(a.transform));
    if (tag === 'g' || tag === 'svg') {
      if (!selfClose) stack.push({ matrix, style });
      continue;
    }
    const f = (k: string) => Number(a[k] ?? 0);
    if (tag === 'path' && a.d) {
      shapes.push({ kind: 'path', attrs: style, matrix, subpaths: parsePathData(a.d).map((s) => ({ points: s.verts as PenPoint[], closed: s.closed })) });
    } else if (tag === 'circle') {
      shapes.push({ kind: 'ellipse', attrs: style, matrix, cx: f('cx'), cy: f('cy'), rx: f('r'), ry: f('r') });
    } else if (tag === 'ellipse') {
      shapes.push({ kind: 'ellipse', attrs: style, matrix, cx: f('cx'), cy: f('cy'), rx: f('rx'), ry: f('ry') });
    } else if (tag === 'rect') {
      shapes.push({ kind: 'rect', attrs: { ...style, rx: a.rx ?? a.ry ?? '0' }, matrix, x: f('x'), y: f('y'), w: f('width'), h: f('height') });
    } else if (tag === 'polygon' || tag === 'polyline') {
      const n = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      const points: PenPoint[] = [];
      for (let k = 0; k + 1 < n.length; k += 2) points.push({ x: n[k], y: n[k + 1] });
      shapes.push({ kind: 'path', attrs: style, matrix, subpaths: [{ points, closed: tag === 'polygon' }] });
    } else if (tag === 'line') {
      shapes.push({ kind: 'path', attrs: style, matrix, subpaths: [{ points: [{ x: f('x1'), y: f('y1') }, { x: f('x2'), y: f('y2') }], closed: false }] });
    }
  }
  return { shapes, viewBox };
}

function colorOf(v: string | undefined, opacity: number): number | null {
  if (!v || v === 'none' || v.startsWith('url(')) return null;
  const named: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080' };
  let c: number;
  try {
    c = parseColor(named[v.toLowerCase()] ?? v);
  } catch {
    return null;
  }
  const a = (((c >>> 24) & 255) / 255) * opacity;
  return ((Math.round(a * 255) << 24) | (c & 0xffffff)) >>> 0;
}

export interface SvgImportOptions {
  artboard: ArtboardDoc;
  parentId?: string;
  /** center of the imported group in parent space */
  x?: number;
  y?: number;
  /** target width (height follows the aspect ratio); default = SVG size */
  width?: number;
  name?: string;
  /** optional names for shapes in document order */
  names?: string[];
}

/**
 * Imports SVG markup as a group of Rive shapes. Circles/ellipses/rects become
 * parametric shapes (easy to animate); everything else becomes vector paths.
 */
export function importSvg(svg: string, o: SvgImportOptions): { group: CoreObj; shapes: CoreObj[] } {
  const { shapes, viewBox } = collectShapes(svg);
  if (!shapes.length) throw new Error('No drawable shapes found in the SVG');
  const [vx, vy, vw, vh] = viewBox;
  const scale = o.width ? o.width / vw : 1;
  const ab = o.artboard;
  const parentId = o.parentId ?? ab.artboard.id;
  // group origin sits at the SVG center, so x/y place its center
  const group = obj('Node', {
    name: o.name ?? 'SVG',
    parentId,
    x: o.x ?? vw * scale * 0.5,
    y: o.y ?? vh * scale * 0.5,
    scaleX: scale,
    scaleY: scale,
  });
  const cx = vx + vw / 2;
  const cy = vy + vh / 2;
  const out: CoreObj[] = [group];
  const created: CoreObj[] = [];
  const docOrder: CoreObj[] = [];
  // SVG paints later elements on top; Rive draws earlier objects on top
  shapes.forEach((s, index) => {
    const opacity = Number(s.attrs.opacity ?? 1);
    const fill = colorOf(s.attrs.fill ?? (s.attrs.fill === undefined ? '#000000' : undefined), Number(s.attrs['fill-opacity'] ?? 1));
    const stroke = colorOf(s.attrs.stroke, 1);
    const name = o.names?.[index] ?? `${s.kind === 'path' ? 'Path' : s.kind === 'ellipse' ? 'Ellipse' : 'Rectangle'} ${index + 1}`;
    // decompose the element transform into translation + (rotation/scale) on the Shape
    const m = s.matrix;
    let shape: CoreObj;
    const objs: CoreObj[] = [];
    if (s.kind === 'ellipse' || s.kind === 'rect') {
      const lx = s.kind === 'ellipse' ? s.cx! : s.x! + s.w! / 2;
      const ly = s.kind === 'ellipse' ? s.cy! : s.y! + s.h! / 2;
      const [px, py] = apply(m, lx, ly);
      const sx = Math.hypot(m[0], m[1]);
      const sy = Math.hypot(m[2], m[3]);
      shape = obj('Shape', { name, parentId: group.id, x: px - cx, y: py - cy, rotation: Math.atan2(m[1], m[0]), scaleX: sx, scaleY: sy });
      const w = s.kind === 'ellipse' ? s.rx! * 2 : s.w!;
      const h = s.kind === 'ellipse' ? s.ry! * 2 : s.h!;
      const path = obj(s.kind === 'ellipse' ? 'Ellipse' : 'Rectangle', { name: `${name} Path`, parentId: shape.id, width: w, height: h, originX: 0.5, originY: 0.5 });
      if (s.kind === 'rect' && Number(s.attrs.rx)) path.props.cornerRadiusTL = Number(s.attrs.rx);
      objs.push(shape, path);
    } else {
      shape = obj('Shape', { name, parentId: group.id, x: 0, y: 0 });
      objs.push(shape);
      for (const sub of s.subpaths ?? []) {
        const path = obj('PointsPath', { name: `${name} Path`, parentId: shape.id, isClosed: sub.closed });
        objs.push(path);
        for (const v of sub.points) {
          const [x, y] = apply(m, v.x, v.y);
          const pen: PenPoint = { x: x - cx, y: y - cy };
          if (v.inX !== undefined) {
            const [ix, iy] = apply(m, v.inX, v.inY!);
            pen.inX = ix - x;
            pen.inY = iy - y;
          }
          if (v.outX !== undefined) {
            const [qx, qy] = apply(m, v.outX, v.outY!);
            pen.outX = qx - x;
            pen.outY = qy - y;
          }
          objs.push(vertexFromPen(path.id, pen));
        }
      }
    }
    if (opacity !== 1) shape.props.opacity = opacity;
    if (fill !== null) {
      const paints = solidFill(shape.id, fill);
      if (s.attrs['fill-rule'] === 'evenodd') paints[0].props.fillRule = 1;
      objs.push(...paints);
    }
    if (stroke !== null) objs.push(...solidStroke(shape.id, stroke, Number(parseFloat(s.attrs['stroke-width'] ?? '1'))));
    created.unshift(shape);
    docOrder.push(shape);
    // prepend so the last SVG element ends up first (on top)
    out.splice(1, 0, ...objs);
  });
  insertObjects(ab, out);
  return { group, shapes: docOrder };
}
