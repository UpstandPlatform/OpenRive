// Smart-guide snapping for the stage: pure geometry, no DOM or store access.
// All coordinates share one space (artboard space while editing a shape).

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A guide line to draw: a vertical (x) or horizontal (y) line at `pos`, spanning `from`..`to` on the other axis. */
export interface Guide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}

export interface SnapResult {
  /** how far to shift the box to land on the guides */
  dx: number;
  dy: number;
  guides: Guide[];
}

const lines = (min: number, max: number): number[] => [min, (min + max) / 2, max];

/**
 * Finds the nearest edge/center alignment between `box` and any target, per axis,
 * within `threshold`. `lanes` restricts which of the box's own lines may snap
 * (resizing from the right edge only snaps the right edge, for example).
 */
export function snapBox(
  box: Box,
  targets: Box[],
  threshold: number,
  lanes: { x?: number[]; y?: number[] } = {},
): SnapResult {
  const best = (axis: 'x' | 'y') => {
    const own = lines(axis === 'x' ? box.minX : box.minY, axis === 'x' ? box.maxX : box.maxY);
    const allowed = lanes[axis] ?? [0, 1, 2];
    let delta = 0;
    let dist = threshold + 1e-9;
    for (const t of targets) {
      const other = lines(axis === 'x' ? t.minX : t.minY, axis === 'x' ? t.maxX : t.maxY);
      for (const i of allowed) {
        for (const o of other) {
          const d = o - own[i]!;
          if (Math.abs(d) < dist) {
            dist = Math.abs(d);
            delta = d;
          }
        }
      }
    }
    return dist <= threshold ? delta : null;
  };
  const dx = best('x');
  const dy = best('y');
  const moved: Box = {
    minX: box.minX + (dx ?? 0),
    maxX: box.maxX + (dx ?? 0),
    minY: box.minY + (dy ?? 0),
    maxY: box.maxY + (dy ?? 0),
  };
  const guides: Guide[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  for (const axis of ['x', 'y'] as const) {
    if ((axis === 'x' ? dx : dy) === null) continue;
    const own = lines(axis === 'x' ? moved.minX : moved.minY, axis === 'x' ? moved.maxX : moved.maxY);
    const allowed = lanes[axis] ?? [0, 1, 2];
    const seen = new Set<string>();
    for (const t of targets) {
      const other = lines(axis === 'x' ? t.minX : t.minY, axis === 'x' ? t.maxX : t.maxY);
      for (const i of allowed) {
        for (const o of other) {
          if (!near(own[i]!, o)) continue;
          const from = axis === 'x' ? Math.min(moved.minY, t.minY) : Math.min(moved.minX, t.minX);
          const to = axis === 'x' ? Math.max(moved.maxY, t.maxY) : Math.max(moved.maxX, t.maxX);
          const key = `${axis}:${o.toFixed(2)}`;
          const prev = guides.find((g) => `${g.axis}:${g.pos.toFixed(2)}` === key);
          if (prev) {
            prev.from = Math.min(prev.from, from);
            prev.to = Math.max(prev.to, to);
          } else if (!seen.has(key)) {
            seen.add(key);
            guides.push({ axis, pos: o, from, to });
          }
        }
      }
    }
  }
  return { dx: dx ?? 0, dy: dy ?? 0, guides };
}

/** Snaps a single point (a corner being dragged) to the targets' edges and centers. */
export function snapPoint(x: number, y: number, targets: Box[], threshold: number): SnapResult & { x: number; y: number } {
  const r = snapBox({ minX: x, maxX: x, minY: y, maxY: y }, targets, threshold, { x: [1], y: [1] });
  return { ...r, x: x + r.dx, y: y + r.dy };
}

/** The rectangle spanned by a create drag, honouring Shift (square) and Alt (from center). */
export function dragRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: { shift?: boolean; alt?: boolean } = {},
): Box {
  let dx = x1 - x0;
  let dy = y1 - y0;
  if (opts.shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * m;
    dy = (dy < 0 ? -1 : 1) * m;
  }
  if (opts.alt) {
    return { minX: x0 - Math.abs(dx), maxX: x0 + Math.abs(dx), minY: y0 - Math.abs(dy), maxY: y0 + Math.abs(dy) };
  }
  return { minX: Math.min(x0, x0 + dx), maxX: Math.max(x0, x0 + dx), minY: Math.min(y0, y0 + dy), maxY: Math.max(y0, y0 + dy) };
}
