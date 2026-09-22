import { ArtboardDoc, CoreObj, newId, RiveDoc } from './document';
import { DEFAULT_HEADER } from './riv-format';

export const obj = (type: string, props: Record<string, unknown> = {}, children?: CoreObj[]): CoreObj => ({
  id: newId(),
  type,
  props,
  ...(children ? { children } : {}),
});

export function solidFill(parentId: string, color: number): CoreObj[] {
  const fill = obj('Fill', { name: 'Fill', parentId });
  const solid = obj('SolidColor', { parentId: fill.id, colorValue: color >>> 0 });
  return [fill, solid];
}

export function solidStroke(parentId: string, color: number, thickness = 2): CoreObj[] {
  const stroke = obj('Stroke', { name: 'Stroke', parentId, thickness });
  const solid = obj('SolidColor', { parentId: stroke.id, colorValue: color >>> 0 });
  return [stroke, solid];
}

export function newArtboard(name: string, x: number, y: number, width = 500, height = 500): ArtboardDoc {
  const artboard = obj('Artboard', {
    name,
    width,
    height,
    originX: 0,
    originY: 0,
    clip: true,
  });
  artboard.ui = { x, y };
  const anim = newAnimation('Timeline 1');
  const sm = newStateMachine('State Machine 1', anim.id);
  return {
    id: artboard.id,
    artboard,
    objects: [...solidFill(artboard.id, 0xff313131)],
    animations: [anim],
    stateMachines: [sm],
  };
}

export function newAnimation(name: string, fps = 60, durationFrames = 60): CoreObj {
  return obj('LinearAnimation', { name, fps, duration: durationFrames, loopValue: 1, speed: 1 }, []);
}

export function newStateMachine(name: string, firstAnimationId?: string): CoreObj {
  const layer = newLayer('Layer 1', firstAnimationId);
  return obj('StateMachine', { name }, [layer]);
}

export function newLayer(name: string, firstAnimationId?: string): CoreObj {
  const entry = obj('EntryState', {}, []);
  const any = obj('AnyState', {}, []);
  const exit = obj('ExitState', {}, []);
  const states: CoreObj[] = [entry, any, exit];
  if (firstAnimationId) {
    const s = obj('AnimationState', { animationId: firstAnimationId }, []);
    entry.children!.push(obj('StateTransition', { stateToId: s.id }, []));
    states.push(s);
  }
  return obj('StateMachineLayer', { name }, states);
}

export function newDoc(name = 'Artboard'): RiveDoc {
  return {
    header: { ...DEFAULT_HEADER },
    top: [obj('Backboard')],
    artboards: [newArtboard(name, 0, 0)],
  };
}

export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'polygon' | 'star';

const shapeTypes: Record<ShapeKind, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  polygon: 'Polygon',
  star: 'Star',
};
const shapeNames: Record<ShapeKind, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  polygon: 'Polygon',
  star: 'Star',
};

/** A Shape node containing a parametric path plus a default fill. */
export function newParametricShape(
  kind: ShapeKind,
  parentId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color = 0xffc4c4c4,
): CoreObj[] {
  const shape = obj('Shape', { name: shapeNames[kind], parentId, x, y });
  const pathProps: Record<string, unknown> = {
    name: `${shapeNames[kind]} Path`,
    parentId: shape.id,
    width,
    height,
    originX: 0.5,
    originY: 0.5,
  };
  if (kind === 'polygon') pathProps.points = 5;
  if (kind === 'star') {
    pathProps.points = 5;
    pathProps.innerRadius = 0.5;
  }
  const path = obj(shapeTypes[kind], pathProps);
  return [shape, path, ...solidFill(shape.id, color)];
}

export interface PenPoint {
  x: number;
  y: number;
  /** control point offsets relative to the vertex (absent = straight vertex) */
  inX?: number;
  inY?: number;
  outX?: number;
  outY?: number;
}

/** A Shape with a PointsPath built from pen points (coordinates relative to the shape). */
export function newPenShape(parentId: string, x: number, y: number, points: PenPoint[], closed: boolean): CoreObj[] {
  const shape = obj('Shape', { name: 'Path', parentId, x, y });
  const path = obj('PointsPath', { name: 'Path', parentId: shape.id, isClosed: closed });
  const verts = points.map((p) => vertexFromPen(path.id, p));
  const paint = closed ? solidFill(shape.id, 0xffc4c4c4) : solidStroke(shape.id, 0xffffffff, 4);
  return [shape, path, ...verts, ...paint];
}

export function vertexFromPen(parentId: string, p: PenPoint): CoreObj {
  if (p.inX === undefined && p.outX === undefined) {
    return obj('StraightVertex', { parentId, x: p.x, y: p.y, radius: 0 });
  }
  const inX = p.inX ?? 0;
  const inY = p.inY ?? 0;
  const outX = p.outX ?? 0;
  const outY = p.outY ?? 0;
  return obj('CubicDetachedVertex', {
    parentId,
    x: p.x,
    y: p.y,
    inRotation: Math.atan2(inY, inX),
    inDistance: Math.hypot(inX, inY),
    outRotation: Math.atan2(outY, outX),
    outDistance: Math.hypot(outX, outY),
  });
}

export function newNode(parentId: string, name = 'Group', x = 0, y = 0): CoreObj {
  return obj('Node', { name, parentId, x, y });
}

export const argb = (a: number, r: number, g: number, b: number) =>
  (((a & 255) << 24) | ((r & 255) << 16) | ((g & 255) << 8) | (b & 255)) >>> 0;
