// High-level document operations with friendly inputs (names or ids, CSS
// colors, seconds or frames). Used by templates, the CLI and the MCP server,
// so humans and AI agents build files through the same code as the editor.
import { ArtboardDoc, CoreObj, RiveDoc } from './document';
import { newAnimation, newArtboard, newLayer, newParametricShape, newPenShape, obj, PenPoint, ShapeKind, solidFill, solidStroke } from './factory';
import { childrenOf, deleteObjects, detachSkin, EASE_PRESETS, findObj, insertObjects, isAncestor, isAnimatable, parentIdOf, reparent, setInterpolation, upsertKeyframe } from './ops';
import { apply, artboardPos, buildScene, Mat, prop, vertexControls, vertexWorldMatrix } from './scene';
import { adjustInfluence, Influence, packInfluences, pointSegmentDistance, unpackInfluences } from './weights';
import {
  artboardViewModel,
  addProperty,
  ConditionOp,
  convertInputsToProperties,
  findProperty,
  properties as dataProperties,
  propertyCondition,
  propertyListenerAction,
  PropertyType,
  PropertyValue,
  propertyValue,
  setPropertyValue,
} from './databind';
import { isA, propDef, propDefByKey } from './schema';
import { BinaryReader } from './binary';
import { ensureFontAsset, newTextObjects, textRuns } from './text';
import { addSwatch, applyTheme, bindColor, ensureEditorMeta, swatchColor } from './theme';

export class ApiError extends Error {}

// ---------------------------------------------------------------------------
// Values

/** Parses "#rgb", "#rrggbb", "#rrggbbaa" (CSS order), "rgba(...)" or an ARGB number. */
export function parseColor(v: unknown): number {
  if (typeof v === 'number') return v >>> 0;
  const s = String(v).trim();
  const m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const rgb = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
    return ((a << 24) | rgb) >>> 0;
  }
  const r = s.match(/^rgba?\(([^)]+)\)$/i);
  if (r) {
    const [cr, cg, cb, ca = '1'] = r[1].split(',').map((x) => x.trim());
    return ((Math.round(Number(ca) * 255) << 24) | (Number(cr) << 16) | (Number(cg) << 8) | Number(cb)) >>> 0;
  }
  const hsl = s.match(/^hsla?\(([^)]+)\)$/i);
  if (hsl) {
    const [hs, ss, ls, as = '1'] = hsl[1].split(/[\s,/]+/).filter(Boolean);
    const h = ((parseFloat(hs) % 360) + 360) % 360;
    const sat = parseFloat(ss) / 100;
    const l = parseFloat(ls) / 100;
    const a = as.endsWith('%') ? parseFloat(as) / 100 : Number(as);
    const k = (n: number) => (n + h / 30) % 12;
    const f = (n: number) => Math.round(255 * (l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return ((Math.round(a * 255) << 24) | (f(0) << 16) | (f(8) << 8) | f(4)) >>> 0;
  }
  throw new ApiError(`Invalid color "${s}". Use #rrggbb, #rrggbbaa, rgba(r,g,b,a) or hsl(h,s%,l%).`);
}

export function formatColor(c: number): string {
  const rgb = ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  const a = (c >>> 24) & 255;
  return a === 255 ? `#${rgb}` : `#${rgb}${a.toString(16).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Lookup

export function getArtboard(doc: RiveDoc, ref?: string): ArtboardDoc {
  if (!ref) {
    const first = doc.artboards[0];
    if (!first) throw new ApiError('The file has no artboards');
    return first;
  }
  const ab = doc.artboards.find((a) => a.id === ref || a.artboard.props.name === ref);
  if (!ab) throw new ApiError(`Artboard "${ref}" not found`);
  return ab;
}

/** Finds a component by id or name (optionally scoped to an artboard). */
export function getObject(doc: RiveDoc, ref: string, artboardRef?: string): { ab: ArtboardDoc; o: CoreObj } {
  const abs = artboardRef ? [getArtboard(doc, artboardRef)] : doc.artboards;
  for (const ab of abs) {
    const o = findObj(ab, ref) ?? ab.objects.find((x) => x.props.name === ref);
    if (o) return { ab, o };
  }
  throw new ApiError(`Object "${ref}" not found`);
}

function getAnimation(ab: ArtboardDoc, ref: string): CoreObj {
  const a = ab.animations.find((x) => x.id === ref || x.props.name === ref);
  if (!a) throw new ApiError(`Timeline "${ref}" not found`);
  return a;
}

function getStateMachine(ab: ArtboardDoc, ref?: string): CoreObj {
  const sm = ref ? ab.stateMachines.find((x) => x.id === ref || x.props.name === ref) : ab.stateMachines[0];
  if (!sm) throw new ApiError(`State machine "${ref ?? '(first)'}" not found`);
  return sm;
}

/** The main paint color holder of a shape/text (SolidColor of its first fill). */
export function fillColorObject(ab: ArtboardDoc, owner: CoreObj, kind: 'Fill' | 'Stroke' = 'Fill'): CoreObj | undefined {
  const holder = owner.type === 'Text' ? childrenOf(ab, owner.id).find((c) => isA(c.type, 'TextStyle')) : owner;
  if (!holder) return undefined;
  const paint = childrenOf(ab, holder.id).find((c) => c.type === kind);
  return paint ? childrenOf(ab, paint.id).find((c) => c.type === 'SolidColor') : undefined;
}

// ---------------------------------------------------------------------------
// Design

export function addArtboard(doc: RiveDoc, o: { name?: string; width?: number; height?: number; x?: number; y?: number; background?: string | number }) {
  const right = doc.artboards.reduce((m, a) => Math.max(m, artboardPos(a.artboard).x + prop(a.artboard, 'width')), -100);
  const ab = newArtboard(o.name ?? `Artboard ${doc.artboards.length + 1}`, o.x ?? right + 100, o.y ?? 0, o.width ?? 500, o.height ?? 500);
  if (o.background !== undefined) {
    const solid = ab.objects.find((x) => x.type === 'SolidColor');
    if (solid) solid.props.colorValue = parseColor(o.background);
  }
  doc.artboards.push(ab);
  return ab;
}

export interface ShapeInput {
  artboard?: string;
  parent?: string;
  kind: ShapeKind;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string | number | null;
  stroke?: string | number;
  strokeWidth?: number;
  cornerRadius?: number;
  points?: number;
  innerRadius?: number;
  rotation?: number; // degrees
}

export function addShape(doc: RiveDoc, s: ShapeInput): CoreObj {
  const ab = getArtboard(doc, s.artboard);
  const parentId = s.parent ? getObject(doc, s.parent, ab.id).o.id : ab.artboard.id;
  const objs = newParametricShape(s.kind, parentId, s.x, s.y, s.width, s.height, s.fill !== undefined && s.fill !== null ? parseColor(s.fill) : 0xffc4c4c4);
  const [shape, path] = objs;
  let out = objs;
  if (s.fill === null) out = objs.slice(0, 2);
  if (s.name) shape.props.name = s.name;
  if (s.rotation) shape.props.rotation = (s.rotation * Math.PI) / 180;
  if (s.cornerRadius !== undefined && s.kind === 'rectangle') path.props.cornerRadiusTL = s.cornerRadius;
  if (s.cornerRadius !== undefined && (s.kind === 'polygon' || s.kind === 'star')) path.props.cornerRadius = s.cornerRadius;
  if (s.points !== undefined) path.props.points = s.points;
  if (s.innerRadius !== undefined) path.props.innerRadius = s.innerRadius;
  if (s.stroke !== undefined) out = [...out, ...solidStroke(shape.id, parseColor(s.stroke), s.strokeWidth ?? 2)];
  insertObjects(ab, out);
  return shape;
}

export function addPath(
  doc: RiveDoc,
  p: { artboard?: string; parent?: string; name?: string; x?: number; y?: number; points: PenPoint[]; closed?: boolean; fill?: string | number; stroke?: string | number; strokeWidth?: number },
): CoreObj {
  const ab = getArtboard(doc, p.artboard);
  const parentId = p.parent ? getObject(doc, p.parent, ab.id).o.id : ab.artboard.id;
  const objs = newPenShape(parentId, p.x ?? 0, p.y ?? 0, p.points, p.closed ?? true).filter(
    (o) => !['Fill', 'Stroke', 'SolidColor'].includes(o.type),
  );
  const shape = objs[0];
  if (p.name) shape.props.name = p.name;
  if (p.fill !== null && (p.fill !== undefined || p.stroke === undefined)) {
    objs.push(...solidFill(shape.id, parseColor(p.fill ?? '#c4c4c4')));
  }
  if (p.stroke !== undefined) objs.push(...solidStroke(shape.id, parseColor(p.stroke), p.strokeWidth ?? 2));
  insertObjects(ab, objs);
  return shape;
}

export function addGroup(doc: RiveDoc, g: { artboard?: string; parent?: string; name?: string; x?: number; y?: number }) {
  const ab = getArtboard(doc, g.artboard);
  const parentId = g.parent ? getObject(doc, g.parent, ab.id).o.id : ab.artboard.id;
  const node = obj('Node', { name: g.name ?? 'Group', parentId, x: g.x ?? 0, y: g.y ?? 0 });
  insertObjects(ab, [node]);
  return node;
}

/** Adds a root bone on the artboard or a child bone at its selected bone's tip. */
export function addBone(
  doc: RiveDoc,
  bone: { artboard?: string; parent?: string; name?: string; x?: number; y?: number; length: number; rotation?: number },
): CoreObj {
  const ab = getArtboard(doc, bone.artboard);
  const parent = bone.parent ? getObject(doc, bone.parent, ab.id).o : ab.artboard;
  if (bone.parent && !isA(parent.type, 'Bone')) throw new ApiError('A child bone must be parented to another bone.');
  const length = Number(bone.length);
  if (!Number.isFinite(length) || length <= 0) throw new ApiError('Bone length must be greater than zero.');
  const rotation = Number(bone.rotation ?? 0);
  if (!Number.isFinite(rotation)) throw new ApiError('Bone rotation must be a finite angle in radians.');
  if (!isA(parent.type, 'Bone') && (!Number.isFinite(Number(bone.x ?? 0)) || !Number.isFinite(Number(bone.y ?? 0)))) {
    throw new ApiError('Root bone coordinates must be finite numbers.');
  }
  const isChildBone = isA(parent.type, 'Bone');
  const created = obj(isChildBone ? 'Bone' : 'RootBone', {
    name: bone.name ?? (isChildBone ? 'Bone' : `Root Bone ${ab.objects.filter((o) => o.type === 'RootBone').length + 1}`),
    parentId: parent.id,
    length,
    rotation,
    ...(isChildBone ? {} : { x: bone.x ?? 0, y: bone.y ?? 0 }),
  });
  insertObjects(ab, [created]);
  return created;
}

/** Captures path and bone bind transforms in the format expected by Rive runtimes. */
export function addSkin(doc: RiveDoc, input: { artboard?: string; path: string; bones: string[] }): CoreObj {
  const ab = getArtboard(doc, input.artboard);
  const path = getObject(doc, input.path, ab.id).o;
  if (path.type !== 'PointsPath' && path.type !== 'Mesh') throw new ApiError('Skinning requires a PointsPath or Mesh.');
  if (childrenOf(ab, path.id).some((child) => child.type === 'Skin')) throw new ApiError('This path already has a skin.');
  if (input.bones.length > 255) throw new ApiError('A skin cannot contain more than 255 bones because vertex influence indices are stored in 8 bits.');
  const bones = input.bones.map((ref) => getObject(doc, ref, ab.id).o);
  if (!bones.length || bones.some((bone) => !isA(bone.type, 'Bone'))) throw new ApiError('Choose one or more bones to bind to the path.');
  if (new Set(bones.map((bone) => bone.id)).size !== bones.length) throw new ApiError('Choose each bone only once when binding a skin.');
  const scene = buildScene(ab);
  const bindProps = (matrix: Mat) => {
    if (!matrix.every(Number.isFinite) || Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 1e-10) throw new ApiError('Binding requires nonzero path and bone scales.');
    return { xx: matrix[0], xy: matrix[1], yx: matrix[2], yy: matrix[3], tx: matrix[4], ty: matrix[5] };
  };
  const skin = obj('Skin', { name: 'Skin', parentId: path.id, ...bindProps(scene.nodes.get(path.id)!.world) });
  const tendons = bones.map((bone) => {
    const node = scene.nodes.get(bone.id);
    if (!node) throw new ApiError(`Could not resolve the bind transform for bone "${displayObjectName(bone)}".`);
    return obj('Tendon', {
      name: `${displayObjectName(bone)} tendon`,
      parentId: skin.id,
      boneId: bone.id,
      ...bindProps(node.world),
    });
  });
  const vertices = childrenOf(ab, path.id).filter((child) => isA(child.type, 'Vertex'));
  const weights = vertices.map((vertex) =>
    obj(isA(vertex.type, 'CubicVertex') ? 'CubicWeight' : 'Weight', {
      name: 'Weight',
      parentId: vertex.id,
      values: 255,
      indices: 1,
      ...(isA(vertex.type, 'CubicVertex') ? { inValues: 255, inIndices: 1, outValues: 255, outIndices: 1 } : {}),
    }),
  );
  ab.objects.push(skin, ...tendons, ...weights);
  autoWeightSkin(doc, { artboard: ab.id, path: path.id });
  return skin;
}

export type WeightChannel = 'point' | 'in' | 'out' | 'all';

function skinParts(doc: RiveDoc, artboard: string | undefined, pathRef: string) {
  const { ab, o: path } = getObject(doc, pathRef, artboard);
  const skin = childrenOf(ab, path.id).find((object) => object.type === 'Skin');
  if (!skin) throw new ApiError('Bind this path to bones before editing weights.');
  const tendons = childrenOf(ab, skin.id).filter((object) => object.type === 'Tendon');
  return { ab, path, skin, tendons };
}

function weightChannels(weight: CoreObj, channel: WeightChannel) {
  if (!['point', 'in', 'out', 'all'].includes(channel)) throw new ApiError('Choose point, in, out, or all weight channels.');
  if (weight.type !== 'CubicWeight' && (channel === 'in' || channel === 'out')) throw new ApiError('Only cubic vertices have handle weights.');
  return channel === 'all' ? (weight.type === 'CubicWeight' ? ['point', 'in', 'out'] as const : ['point'] as const) : [channel];
}

function readWeights(weight: CoreObj, channel: string) {
  const prefix = channel === 'point' ? '' : channel;
  return unpackInfluences(Number(weight.props[prefix ? `${prefix}Indices` : 'indices'] ?? 0), Number(weight.props[prefix ? `${prefix}Values` : 'values'] ?? 0));
}

function writeWeights(weight: CoreObj, channel: string, influences: Influence[]) {
  const packed = packInfluences(influences);
  const prefix = channel === 'point' ? '' : channel;
  weight.props[prefix ? `${prefix}Indices` : 'indices'] = packed.indices;
  weight.props[prefix ? `${prefix}Values` : 'values'] = packed.values;
}

/** Edits independently weighted points or handles through the shared editing API. */
export function setSkinWeights(doc: RiveDoc, input: { artboard?: string; vertex: string; influences: Influence[]; channel?: WeightChannel }) {
  const { ab, o: vertex } = getObject(doc, input.vertex, input.artboard);
  const { tendons } = skinParts(doc, ab.id, String(vertex.props.parentId));
  const weight = childrenOf(ab, vertex.id).find((object) => object.type === 'Weight' || object.type === 'CubicWeight');
  if (!weight) throw new ApiError('This vertex has no skin weight.');
  if (input.influences.some((item) => item.index > tendons.length)) throw new ApiError('Choose an influence from this skin.');
  const channels = weightChannels(weight, input.channel ?? 'all');
  packInfluences(input.influences); // validate before changing any channel
  for (const channel of channels) writeWeights(weight, channel, input.influences);
  return weight;
}

/** Assigns the four nearest bone segments with smoothly normalized inverse-distance weights. */
export function autoWeightSkin(doc: RiveDoc, input: { artboard?: string; path: string }) {
  const { ab, path, tendons } = skinParts(doc, input.artboard, input.path);
  if (!tendons.length || tendons.some((tendon) => !isA(findObj(ab, String(tendon.props.boneId))?.type ?? '', 'Bone'))) throw new ApiError('This skin requires existing bones before auto weighting.');
  for (const vertex of childrenOf(ab, path.id).filter((object) => isA(object.type, 'Vertex'))) {
    if (!childrenOf(ab, vertex.id).some((object) => isA(object.type, 'Weight'))) ab.objects.push(obj(isA(vertex.type, 'CubicVertex') ? 'CubicWeight' : 'Weight', { parentId: vertex.id, indices: 0, values: 255, ...(isA(vertex.type, 'CubicVertex') ? { inIndices: 0, outIndices: 0, inValues: 255, outValues: 255 } : {}) }));
  }
  const scene = buildScene(ab);
  const segments = tendons.map((tendon, index) => {
    const bone = findObj(ab, String(tendon.props.boneId));
    const world = bone && scene.nodes.get(bone.id)?.world;
    if (!bone || !world) throw new ApiError('This skin references a missing bone.');
    return { index: index + 1, base: apply(world, 0, 0), tip: apply(world, prop(bone, 'length'), 0) };
  });
  if (!segments.length) throw new ApiError('A skin needs at least one bone.');
  for (const vertex of childrenOf(ab, path.id).filter((object) => isA(object.type, 'Vertex'))) {
    const controls = vertexControls(vertex);
    const weight = childrenOf(ab, vertex.id).find((object) => object.type === 'Weight' || object.type === 'CubicWeight');
    if (!weight) continue;
    for (const channel of weightChannels(weight, 'all')) {
      const point = channel === 'point' ? [controls.x, controls.y] : controls[channel as 'in' | 'out'] ?? [controls.x, controls.y];
      const world = apply(vertexWorldMatrix(scene, vertex, channel as 'point' | 'in' | 'out'), point[0], point[1]);
      const distances = segments.map((segment) => ({ index: segment.index, distance: pointSegmentDistance(...world, segment.base, segment.tip) })).sort((a, b) => a.distance - b.distance).slice(0, 4);
      const coincident = distances.filter((item) => item.distance < 0.001);
      writeWeights(weight, channel, (coincident.length ? coincident : distances).map((item) => ({ index: item.index, weight: coincident.length ? 1 : 1 / Math.max(0.001, item.distance) ** 2 })));
    }
  }
}

export function smoothSkinWeights(doc: RiveDoc, input: { artboard?: string; path: string }) {
  const { ab, path } = skinParts(doc, input.artboard, input.path);
  const vertices = childrenOf(ab, path.id).filter((object) => isA(object.type, 'Vertex'));
  const weights = vertices.map((vertex) => childrenOf(ab, vertex.id).find((object) => object.type === 'Weight' || object.type === 'CubicWeight'));
  const original = weights.map((weight) => weight ? { point: readWeights(weight, 'point'), in: readWeights(weight, weight.type === 'CubicWeight' ? 'in' : 'point'), out: readWeights(weight, weight.type === 'CubicWeight' ? 'out' : 'point') } : null);
  const adjacency = vertices.map((_, index) => new Set([index]));
  if (path.type === 'Mesh') {
    const bytes = path.props.triangleIndexBytes;
    if (!(bytes instanceof Uint8Array)) throw new ApiError('Mesh smoothing requires triangle topology.');
    const reader = new BinaryReader(bytes);
    while (!reader.isEOF) {
      const triangle = [reader.readVarUint(), reader.readVarUint(), reader.readVarUint()];
      if (triangle.some((index) => !Number.isInteger(index) || index >= vertices.length)) throw new ApiError('This mesh contains invalid triangle indices.');
      for (const index of triangle) for (const neighbor of triangle) adjacency[index].add(neighbor);
    }
  }
  weights.forEach((weight, index) => {
    if (!weight) return;
    const neighbors = path.type === 'Mesh' ? [...adjacency[index]] : [index - 1, index, index + 1].map((i) => prop<boolean>(path, 'isClosed') ? (i + weights.length) % weights.length : Math.max(0, Math.min(weights.length - 1, i)));
    for (const channel of weightChannels(weight, 'all')) writeWeights(weight, channel, neighbors.flatMap((i) => original[i]?.[channel as 'point' | 'in' | 'out'] ?? []));
  });
}

/** A swept brush edits each touched point once per input sample, with radial falloff. Coordinates are artboard-space. */
export function paintSkinWeights(doc: RiveDoc, input: { artboard?: string; path: string; bone: string; x: number; y: number; fromX?: number; fromY?: number; radius: number; strength: number; mode?: 'add' | 'subtract'; channel?: WeightChannel }) {
  if (input.mode && input.mode !== 'add' && input.mode !== 'subtract') throw new ApiError('Choose add or subtract brush mode.');
  if (![input.x, input.y, input.fromX ?? input.x, input.fromY ?? input.y, input.radius, input.strength].every(Number.isFinite) || input.radius <= 0 || input.strength < 0 || input.strength > 1) throw new ApiError('Use a positive brush radius and strength between 0 and 1.');
  const { ab, path, tendons } = skinParts(doc, input.artboard, input.path);
  const bone = getObject(doc, input.bone, ab.id).o;
  const index = tendons.findIndex((tendon) => tendon.props.boneId === bone.id) + 1;
  if (!index) throw new ApiError('Choose a bone bound to this path.');
  const scene = buildScene(ab);
  weightChannels({ type: 'CubicWeight' } as CoreObj, input.channel ?? 'all');
  let changed = 0;
  for (const vertex of childrenOf(ab, path.id).filter((object) => isA(object.type, 'Vertex'))) {
    const weight = childrenOf(ab, vertex.id).find((object) => object.type === 'Weight' || object.type === 'CubicWeight');
    if (!weight) continue;
    const controls = vertexControls(vertex);
    if (weight.type !== 'CubicWeight' && (input.channel === 'in' || input.channel === 'out')) continue;
    for (const channel of weightChannels(weight, input.channel ?? 'all')) {
      const point = channel === 'point' ? [controls.x, controls.y] : controls[channel as 'in' | 'out'];
      if (!point) continue;
      const world = apply(vertexWorldMatrix(scene, vertex, channel as 'point' | 'in' | 'out'), point[0], point[1]);
      const distance = pointSegmentDistance(...world, [input.fromX ?? input.x, input.fromY ?? input.y], [input.x, input.y]);
      if (distance >= input.radius) continue;
      const influences = readWeights(weight, channel);
      const before = influences.filter((item) => item.index === index).reduce((sum, item) => sum + item.weight, 0);
      const delta = input.strength * (1 - distance / input.radius) * (input.mode === 'subtract' ? -1 : 1);
      writeWeights(weight, channel, adjustInfluence(influences, index, before + delta));
      changed++;
    }
  }
  return changed;
}

export function unbindSkin(doc: RiveDoc, input: { artboard?: string; path: string }) {
  const { ab, path } = skinParts(doc, input.artboard, input.path);
  detachSkin(ab, path.id);
}

export function rebindSkin(doc: RiveDoc, input: { artboard?: string; path: string }) {
  const { ab, path, tendons } = skinParts(doc, input.artboard, input.path);
  const bones = tendons.map((tendon) => String(tendon.props.boneId));
  const scene = buildScene(ab);
  for (const id of [path.id, ...bones]) {
    const matrix = scene.nodes.get(id)?.world;
    if (!matrix || !matrix.every(Number.isFinite) || Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 1e-10) throw new ApiError('Rebinding requires existing bones and nonzero path and bone scales.');
  }
  const saved = childrenOf(ab, path.id).map((vertex) => ({ id: vertex.id, weight: childrenOf(ab, vertex.id).find((object) => object.type === 'Weight' || object.type === 'CubicWeight')?.props }));
  detachSkin(ab, path.id);
  addSkin(doc, { artboard: ab.id, path: path.id, bones });
  for (const entry of saved) {
    if (!entry.weight) continue;
    const weight = childrenOf(ab, entry.id).find((object) => object.type === 'Weight' || object.type === 'CubicWeight');
    if (weight) for (const key of ['indices', 'values', 'inIndices', 'inValues', 'outIndices', 'outValues']) if (key in entry.weight) weight.props[key] = entry.weight[key];
  }
}

export function setBoneParent(doc: RiveDoc, input: { artboard?: string; bone: string; parent?: string }) {
  const { ab, o: bone } = getObject(doc, input.bone, input.artboard);
  if (!isA(bone.type, 'Bone')) throw new ApiError('Choose a bone to link.');
  const parent = input.parent ? getObject(doc, input.parent, ab.id).o : ab.artboard;
  if (parent.id === bone.id || isAncestor(ab, bone.id, parent.id)) throw new ApiError('A bone cannot be linked to itself or its descendants.');
  if (input.parent && !isA(parent.type, 'Bone')) throw new ApiError('Choose a parent bone or detach to the artboard.');
  reparent(ab, bone.id, parent.id);
  return bone;
}

/** Changes a path vertex shape while keeping any attached skin weights valid. */
export function convertVertexType(doc: RiveDoc, input: { artboard?: string; vertex: string; type: 'StraightVertex' | 'CubicMirroredVertex' | 'CubicAsymmetricVertex' | 'CubicDetachedVertex' }): CoreObj {
  const { ab, o: vertex } = getObject(doc, input.vertex, input.artboard);
  if (!isA(vertex.type, 'PathVertex')) throw new ApiError('Only path vertices can be converted.');
  const x = prop(vertex, 'x');
  const y = prop(vertex, 'y');
  const base = { parentId: vertex.props.parentId, x, y, ...(vertex.props.name ? { name: vertex.props.name } : {}) };
  const distance = 30;
  vertex.type = input.type;
  if (input.type === 'StraightVertex') vertex.props = { ...base, radius: 0 };
  else if (input.type === 'CubicMirroredVertex') vertex.props = { ...base, rotation: 0, distance };
  else if (input.type === 'CubicAsymmetricVertex') vertex.props = { ...base, rotation: 0, inDistance: distance, outDistance: distance };
  else vertex.props = { ...base, inRotation: Math.PI, inDistance: distance, outRotation: 0, outDistance: distance };

  const weight = childrenOf(ab, vertex.id).find((child) => child.type === 'Weight' || child.type === 'CubicWeight');
  if (weight) {
    const targetIsCubic = isA(input.type, 'CubicVertex');
    if (targetIsCubic && weight.type === 'Weight') {
      weight.type = 'CubicWeight';
      Object.assign(weight.props, {
        inValues: weight.props.values ?? 0,
        inIndices: weight.props.indices ?? 0,
        outValues: weight.props.values ?? 0,
        outIndices: weight.props.indices ?? 0,
      });
    } else if (!targetIsCubic && weight.type === 'CubicWeight') {
      weight.type = 'Weight';
      for (const key of ['inValues', 'inIndices', 'outValues', 'outIndices']) delete weight.props[key];
    }
  }
  return vertex;
}

function displayObjectName(object: CoreObj): string {
  return typeof object.props.name === 'string' && object.props.name ? object.props.name : object.type;
}

export function addText(
  doc: RiveDoc,
  t: {
    artboard?: string;
    parent?: string;
    text: string;
    x: number;
    y: number;
    fontSize?: number;
    color?: string | number;
    name?: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    /** 'center' makes x/y the center of the text box */
    origin?: 'topLeft' | 'center';
    font: { name: string; bytes: Uint8Array };
  },
): CoreObj {
  const ab = getArtboard(doc, t.artboard);
  const parentId = t.parent ? getObject(doc, t.parent, ab.id).o.id : ab.artboard.id;
  const fontAssetId = ensureFontAsset(doc, t.font.name, t.font.bytes);
  const objs = newTextObjects({
    parentId,
    x: t.x,
    y: t.y,
    text: t.text,
    fontAssetId,
    fontSize: t.fontSize,
    color: t.color !== undefined ? parseColor(t.color) : undefined,
    name: t.name,
    width: t.width,
    align: t.align,
  });
  if (t.origin === 'center') {
    objs[0].props.originX = 0.5;
    objs[0].props.originY = 0.5;
  }
  insertObjects(ab, objs);
  return objs[0];
}

export function setText(doc: RiveDoc, ref: string, text: string) {
  const { ab, o } = getObject(doc, ref);
  const runs = textRuns(ab, o.id);
  if (!runs.length) throw new ApiError(`"${ref}" is not a text object`);
  runs[0].props.text = text;
  ab.objects = ab.objects.filter((r) => !runs.slice(1).includes(r));
}

/**
 * Sets properties by name. Accepts friendly aliases: rotation in degrees via
 * `rotationDegrees`, colors as strings, `fill`/`stroke` for a shape's colors.
 */
export function setProperties(doc: RiveDoc, ref: string, props: Record<string, unknown>) {
  const { ab, o } = getObject(doc, ref);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'rotationDegrees') {
      o.props.rotation = (Number(v) * Math.PI) / 180;
      continue;
    }
    if (k === 'fill' || k === 'stroke') {
      const solid = fillColorObject(ab, o, k === 'fill' ? 'Fill' : 'Stroke');
      if (!solid) throw new ApiError(`"${ref}" has no ${k}`);
      solid.props.colorValue = parseColor(v);
      bindColor(solid, 'colorValue', null);
      continue;
    }
    if (k === 'text') {
      setText(doc, ref, String(v));
      continue;
    }
    // text style shortcuts
    if (o.type === 'Text' && ['fontSize', 'lineHeight', 'letterSpacing'].includes(k)) {
      for (const st of childrenOf(ab, o.id).filter((c) => isA(c.type, 'TextStyle'))) st.props[k] = Number(v);
      continue;
    }
    const pd = propDef(o.type, k);
    if (!pd) throw new ApiError(`${o.type} has no property "${k}"`);
    o.props[k] = pd.type === 'color' ? parseColor(v) : pd.type === 'bool' ? !!v : pd.type === 'string' ? String(v) : Number(v);
  }
  return o;
}

export function deleteObjectsByRef(doc: RiveDoc, refs: string[]) {
  for (const ref of refs) {
    const { ab, o } = getObject(doc, ref);
    deleteObjects(ab, [o.id]);
  }
}

// ---------------------------------------------------------------------------
// Animation

export function addAnimation(
  doc: RiveDoc,
  a: { artboard?: string; name: string; fps?: number; duration?: number; durationFrames?: number; loop?: 'oneShot' | 'loop' | 'pingPong'; speed?: number },
) {
  const ab = getArtboard(doc, a.artboard);
  const fps = a.fps ?? 60;
  const frames = a.durationFrames ?? Math.max(1, Math.round((a.duration ?? 1) * fps));
  const anim = newAnimation(a.name, fps, frames);
  anim.props.loopValue = a.loop === 'oneShot' ? 0 : a.loop === 'pingPong' ? 2 : 1;
  if (a.speed !== undefined) anim.props.speed = a.speed;
  ab.animations.push(anim);
  return anim;
}

export type Ease = 'hold' | 'linear' | 'easeInOut' | 'easeIn' | 'easeOut' | 'easeOutBack' | 'easeInBack' | [number, number, number, number];

const EASE_NAMES: Record<string, [number, number, number, number]> = {
  easeInOut: EASE_PRESETS['Ease In Out'],
  easeIn: EASE_PRESETS['Ease In'],
  easeOut: EASE_PRESETS['Ease Out'],
  easeOutBack: EASE_PRESETS['Ease Out Back'],
  easeInBack: EASE_PRESETS['Ease In Back'],
};

export interface KeyInput {
  /** frame number, or use `time` in seconds */
  frame?: number;
  time?: number;
  value?: number | string | boolean;
  /** for color properties: use (and stay bound to) a named theme color */
  themeColor?: string;
  /** interpolation from this key to the next */
  ease?: Ease;
}

/** Adds keyframes for one property. `property` may be a real property name, or `fill`/`stroke`/`rotationDegrees`. */
export function addKeyframes(doc: RiveDoc, k: { artboard?: string; animation: string; object: string; property: string; keys: KeyInput[] }) {
  const { ab, o } = getObject(doc, k.object, k.artboard);
  const anim = getAnimation(ab, k.animation);
  let target = o;
  let property = k.property;
  let conv = (v: KeyInput['value']): unknown => v;
  if (property === 'fill' || property === 'stroke') {
    const solid = fillColorObject(ab, o, property === 'fill' ? 'Fill' : 'Stroke');
    if (!solid) throw new ApiError(`"${k.object}" has no ${property}`);
    target = solid;
    property = 'colorValue';
  } else if (property === 'rotationDegrees') {
    property = 'rotation';
    conv = (v) => (Number(v) * Math.PI) / 180;
  } else if (o.type === 'Text' && property === 'fontSize') {
    target = childrenOf(ab, o.id).find((c) => isA(c.type, 'TextStyle')) ?? o;
  } else if (!propDef(o.type, property) && o.type === 'Shape') {
    // allow path properties (width/height/cornerRadiusTL...) on the shape's path
    const path = childrenOf(ab, o.id).find((c) => isA(c.type, 'Path') && propDef(c.type, property));
    if (path) target = path;
  }
  const pd = propDef(target.type, property);
  if (!pd || !isAnimatable(target.type, property)) throw new ApiError(`${target.type}.${property} can't be animated`);
  const fps = prop(anim, 'fps') || 60;
  const created: CoreObj[] = [];
  for (const key of k.keys) {
    const frame = key.frame ?? Math.round((key.time ?? 0) * fps);
    let swatchId: string | undefined;
    if (key.themeColor !== undefined) {
      const sw = doc.editor?.swatches.find((x) => x.name === key.themeColor || x.id === key.themeColor);
      if (!sw) throw new ApiError(`Theme color "${key.themeColor}" not defined`);
      swatchId = sw.id;
    }
    let value = conv(swatchId ? swatchColor(doc, swatchId) ?? 0 : key.value ?? 0);
    if (pd.type === 'color') value = parseColor(value);
    else if (pd.type === 'bool') value = !!value;
    else value = Number(value);
    const kf = upsertKeyframe(anim, target, property, value, frame)!;
    if (pd.type === 'color') bindColor(kf, 'value', swatchId ?? null);
    const ease = key.ease ?? 'easeInOut';
    if (ease === 'hold' || ease === 'linear') setInterpolation(ab, [kf], ease);
    else setInterpolation(ab, [kf], 'cubic', Array.isArray(ease) ? ease : EASE_NAMES[ease] ?? EASE_PRESETS['Ease In Out']);
    created.push(kf);
  }
  const dur = prop(anim, 'duration');
  const maxFrame = Math.max(...created.map((kf) => prop(kf, 'frame')));
  if (maxFrame > dur) anim.props.duration = maxFrame;
  return created;
}

// ---------------------------------------------------------------------------
// Data binding properties (what replaces state machine inputs)

export function addDataProperty(
  doc: RiveDoc,
  p: { artboard?: string; name: string; type: PropertyType; value?: PropertyValue; viewModel?: string },
) {
  const ab = getArtboard(doc, p.artboard);
  if (findProperty(doc, ab, p.name)) throw new ApiError(`This artboard already has a property named "${p.name}"`);
  return addProperty(doc, ab, { name: p.name, type: p.type, value: p.value, viewModelName: p.viewModel });
}

export function setDataProperty(doc: RiveDoc, p: { artboard?: string; property: string; value: PropertyValue }) {
  const ab = getArtboard(doc, p.artboard);
  const updated = setPropertyValue(doc, ab, p.property, p.value);
  if (!updated) throw new ApiError(`Property "${p.property}" not found`);
  return updated;
}

/** Rewrites deprecated state machine inputs as data binding properties. */
export function convertInputs(doc: RiveDoc, o: { artboard?: string; stateMachine?: string } = {}) {
  const ab = getArtboard(doc, o.artboard);
  return convertInputsToProperties(doc, ab, o.stateMachine ? getStateMachine(ab, o.stateMachine) : undefined);
}

// ---------------------------------------------------------------------------
// State machines

export function addStateMachine(doc: RiveDoc, s: { artboard?: string; name: string }) {
  const ab = getArtboard(doc, s.artboard);
  const sm = obj('StateMachine', { name: s.name }, [newLayer('Layer 1')]);
  ab.stateMachines.push(sm);
  return sm;
}

export function addInput(doc: RiveDoc, i: { artboard?: string; stateMachine?: string; type: 'number' | 'boolean' | 'trigger'; name: string; value?: number | boolean }) {
  const ab = getArtboard(doc, i.artboard);
  const sm = getStateMachine(ab, i.stateMachine);
  const type = i.type === 'number' ? 'StateMachineNumber' : i.type === 'boolean' ? 'StateMachineBool' : 'StateMachineTrigger';
  const input = obj(type, { name: i.name, ...(i.value !== undefined && i.type !== 'trigger' ? { value: i.value } : {}) });
  sm.children ??= [];
  const firstNonInput = sm.children.findIndex((c) => !isA(c.type, 'StateMachineInput'));
  if (firstNonInput < 0) sm.children.push(input);
  else sm.children.splice(firstNonInput, 0, input);
  return input;
}

function layerOf(sm: CoreObj, ref?: string): CoreObj {
  const layers = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineLayer'));
  const l = ref ? layers.find((x) => x.id === ref || x.props.name === ref) : layers[0];
  if (!l) throw new ApiError(`Layer "${ref ?? '(first)'}" not found`);
  return l;
}

/** Resolves "entry" | "any" | "exit" | state id | timeline name to a layer state. */
function stateRef(ab: ArtboardDoc, layer: CoreObj, ref: string): CoreObj {
  const states = (layer.children ?? []).filter((c) => isA(c.type, 'LayerState'));
  const special: Record<string, string> = { entry: 'EntryState', any: 'AnyState', exit: 'ExitState' };
  const byType = special[ref.toLowerCase()];
  const found =
    (byType && states.find((s) => s.type === byType)) ||
    states.find((s) => s.id === ref) ||
    states.find((s) => s.type === 'AnimationState' && ab.animations.find((a) => a.id === s.props.animationId)?.props.name === ref);
  if (!found) throw new ApiError(`State "${ref}" not found (use entry, any, exit, a state id or a timeline name)`);
  return found;
}

export function addState(doc: RiveDoc, s: { artboard?: string; stateMachine?: string; layer?: string; animation: string; x?: number; y?: number }) {
  const ab = getArtboard(doc, s.artboard);
  const sm = getStateMachine(ab, s.stateMachine);
  const layer = layerOf(sm, s.layer);
  const anim = getAnimation(ab, s.animation);
  const st = obj('AnimationState', { animationId: anim.id }, []);
  if (s.x !== undefined) st.ui = { x: s.x, y: s.y ?? 0 };
  (layer.children ??= []).push(st);
  return st;
}

/** Adds a 1D blend state driven by a numeric state-machine parameter. */
export function addBlendState(
  doc: RiveDoc,
  s: { artboard?: string; stateMachine?: string; layer?: string; parameter?: string; animations: { animation: string; value: number }[]; x?: number; y?: number },
) {
  const ab = getArtboard(doc, s.artboard);
  const sm = getStateMachine(ab, s.stateMachine);
  const layer = layerOf(sm, s.layer);
  if (!s.animations.length) throw new ApiError('A 1D blend state needs at least one timeline');
  let input = (sm.children ?? []).find((child) => isA(child.type, 'StateMachineNumber') && (child.id === s.parameter || child.props.name === s.parameter));
  if (!input) {
    const name = s.parameter?.trim() || 'Blend 1D';
    input = obj('StateMachineNumber', { name });
    sm.children ??= [];
    const firstLayer = sm.children.findIndex((child) => isA(child.type, 'StateMachineLayer'));
    sm.children.splice(firstLayer < 0 ? sm.children.length : firstLayer, 0, input);
  }
  const children = s.animations.map(({ animation, value }) => {
    const timeline = getAnimation(ab, animation);
    return obj('BlendAnimation1D', { animationId: timeline.id, value });
  });
  const state = obj('BlendState1DInput', { inputId: input.id }, children);
  if (s.x !== undefined) state.ui = { x: s.x, y: s.y ?? 0 };
  (layer.children ??= []).push(state);
  return state;
}

export interface ConditionInput {
  /** a data binding property (preferred — state machine inputs are deprecated) */
  property?: string;
  /** a state machine input; falls back to a property of the same name */
  input?: string;
  /** for numbers: == != < <= > >= ; for booleans: value true/false ; triggers need neither */
  op?: ConditionOp;
  value?: number | boolean | string;
}

export function addTransition(
  doc: RiveDoc,
  t: {
    artboard?: string;
    stateMachine?: string;
    layer?: string;
    from: string;
    to: string;
    durationMs?: number;
    exitTimeMs?: number;
    conditions?: ConditionInput[];
  },
) {
  const ab = getArtboard(doc, t.artboard);
  const sm = getStateMachine(ab, t.stateMachine);
  const layer = layerOf(sm, t.layer);
  const from = stateRef(ab, layer, t.from);
  const to = stateRef(ab, layer, t.to);
  const inputs = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineInput'));
  const ops = { '==': 0, '!=': 1, '<=': 2, '>=': 3, '<': 4, '>': 5 };
  const conditions = (t.conditions ?? []).map((c) => {
    const name = c.property ?? c.input;
    if (!name) throw new ApiError('A condition needs a property (or a state machine input) to read');
    // data binding first; an "input" that is really a property still works
    const input = c.property ? undefined : inputs.find((i) => i.id === name || i.props.name === name);
    if (!input) {
      const p = findProperty(doc, ab, name);
      if (!p) throw new ApiError(`No data binding property or input named "${name}"`);
      return propertyCondition(p, c.op ?? '==', c.value);
    }
    if (input.type === 'StateMachineTrigger') return obj('TransitionTriggerCondition', { inputId: input.id });
    if (input.type === 'StateMachineBool') return obj('TransitionBoolCondition', { inputId: input.id, opValue: c.value === false ? 1 : 0 });
    return obj('TransitionNumberCondition', { inputId: input.id, opValue: ops[c.op ?? '=='], value: Number(c.value ?? 0) });
  });
  const flags = t.exitTimeMs !== undefined ? 4 : 0;
  const tr = obj(
    'StateTransition',
    { stateToId: to.id, duration: t.durationMs ?? 0, flags, ...(t.exitTimeMs !== undefined ? { exitTime: t.exitTimeMs } : {}) },
    conditions,
  );
  (from.children ??= []).push(tr);
  return tr;
}

export function addListener(
  doc: RiveDoc,
  l: {
    artboard?: string;
    stateMachine?: string;
    target?: string;
    event: 'down' | 'up' | 'click' | 'enter' | 'exit' | 'move' | 'rive';
    eventName?: string;
    name?: string;
    /**
     * property changes (preferred), input changes, or { alignTarget } to move an
     * object to the pointer (e.g. eyes following the cursor)
     */
    actions: (
      | { property: string; value?: number | boolean | string }
      | { input: string; value?: number | boolean | 'toggle' }
      | { alignTarget: string; preserveOffset?: boolean }
      | { fireEvent: string }
    )[];
  },
) {
  const ab = getArtboard(doc, l.artboard);
  const sm = getStateMachine(ab, l.stateMachine);
  const inputs = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineInput'));
  const events = { enter: 0, exit: 1, down: 2, up: 3, move: 4, rive: 5, click: 6 };
  const target = l.target ? getObject(doc, l.target, ab.id).o : undefined;
  const reportedEvent = l.event === 'rive' ? ab.objects.find((o) => o.type === 'Event' && (o.id === l.eventName || o.props.name === l.eventName)) : undefined;
  if (l.event === 'rive' && !reportedEvent) throw new ApiError(`No event named "${l.eventName ?? ''}"`);
  const actions = l.actions.flatMap((a) => {
    if ('fireEvent' in a) {
      const event = ab.objects.find((o) => o.id === a.fireEvent || (o.type === 'Event' && o.props.name === a.fireEvent));
      if (!event || event.type !== 'Event') throw new ApiError(`No event named "${a.fireEvent}"`);
      return [obj('ListenerFireEvent', { eventId: event.id })];
    }
    if ('alignTarget' in a) {
      const t = getObject(doc, a.alignTarget, ab.id).o;
      return [obj('ListenerAlignTarget', { targetId: t.id, ...(a.preserveOffset ? { preserveOffset: true } : {}) })];
    }
    const name = 'property' in a ? a.property : a.input;
    // data binding first; an "input" that is really a property still works
    const input = 'property' in a ? undefined : inputs.find((i) => i.id === name || i.props.name === name);
    if (!input) {
      const p = findProperty(doc, ab, name);
      if (!p) throw new ApiError(`No data binding property or input named "${name}"`);
      if (a.value === 'toggle') throw new ApiError('"toggle" needs a state machine input; set the property to true or false instead');
      return propertyListenerAction(p, a.value);
    }
    if (input.type === 'StateMachineTrigger') return [obj('ListenerTriggerChange', { inputId: input.id })];
    if (input.type === 'StateMachineBool')
      return [obj('ListenerBoolChange', { inputId: input.id, value: a.value === 'toggle' ? 2 : a.value === false ? 0 : 1 })];
    return [obj('ListenerNumberChange', { inputId: input.id, value: Number(a.value ?? 0) })];
  });
  const listener = obj(
    'StateMachineListenerSingle',
    { name: l.name ?? 'Listener', listenerTypeValue: events[l.event], ...(target ? { targetId: target.id } : {}), ...(reportedEvent ? { eventId: reportedEvent.id } : {}) },
    actions,
  );
  (sm.children ??= []).push(listener);
  return listener;
}

/** Adds a named custom event to an artboard for state machines and listeners to report. */
export function addEvent(
  doc: RiveDoc,
  e: { artboard?: string; name: string; properties?: { name: string; type: 'number' | 'boolean' | 'string' | 'color'; value?: number | boolean | string }[] },
) {
  const ab = getArtboard(doc, e.artboard);
  const name = e.name.trim();
  if (!name) throw new ApiError('Event name cannot be empty');
  if (ab.objects.some((o) => o.type === 'Event' && String(o.props.name).toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new ApiError(`An event named "${name}" already exists`);
  }
  const fieldNames = new Set<string>();
  for (const field of e.properties ?? []) {
    const fieldName = field.name.trim();
    if (!fieldName) throw new ApiError('Event property names cannot be empty');
    const key = fieldName.toLocaleLowerCase();
    if (fieldNames.has(key)) throw new ApiError(`An event property named "${fieldName}" already exists`);
    fieldNames.add(key);
  }
  const event = obj('Event', { name, parentId: ab.artboard.id });
  ab.objects.push(event);
  for (const field of e.properties ?? []) {
    const fieldName = field.name.trim();
    const type = field.type === 'number' ? 'CustomPropertyNumber' : field.type === 'boolean' ? 'CustomPropertyBoolean' : field.type === 'color' ? 'CustomPropertyColor' : 'CustomPropertyString';
    const value = field.type === 'number' ? Number(field.value ?? 0) : field.type === 'boolean' ? !!field.value : field.type === 'color' ? Number(field.value ?? 0xffffffff) >>> 0 : String(field.value ?? '');
    const property = obj(type, { name: fieldName, parentId: event.id, propertyValue: value });
    ab.objects.push(property);
  }
  return event;
}

/** Renames an event, keeping its artboard's event names unique. */
export function renameEvent(doc: RiveDoc, eventRef: string, name: string, artboardRef?: string) {
  const { ab, o } = getObject(doc, eventRef, artboardRef);
  if (o.type !== 'Event') throw new ApiError(`"${eventRef}" is not an event`);
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError('Event name cannot be empty');
  if (ab.objects.some((item) => item.id !== o.id && item.type === 'Event' && String(item.props.name).toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
    throw new ApiError(`An event named "${trimmed}" already exists`);
  }
  o.props.name = trimmed;
  return o;
}

/** Removes an artboard event and any state-machine references to it. */
export function removeEvent(doc: RiveDoc, eventRef: string, artboardRef?: string) {
  const { ab, o } = getObject(doc, eventRef, artboardRef);
  if (o.type !== 'Event') throw new ApiError(`"${eventRef}" is not an event`);
  const doomed = new Set([o.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of ab.objects) {
      if (typeof item.props.parentId === 'string' && doomed.has(item.props.parentId) && !doomed.has(item.id)) {
        doomed.add(item.id);
        changed = true;
      }
    }
  }
  ab.objects = ab.objects.filter((item) => !doomed.has(item.id));
  for (const sm of ab.stateMachines) {
    const clean = (item: CoreObj) => {
      item.children = item.children?.filter((child) => {
        if (child.type === 'StateMachineListenerSingle' && child.props.eventId === o.id) return false;
        if ((child.type === 'ListenerFireEvent' || child.type === 'StateMachineFireEvent') && child.props.eventId === o.id) return false;
        return true;
      });
      item.children?.forEach(clean);
    };
    clean(sm);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Constraints & clipping

/**
 * Keeps `object` within (mode "closer"), beyond ("further") or exactly at
 * `distance` from `target`. Great for eyes, tethered parts and joysticks.
 */
export function addDistanceConstraint(
  doc: RiveDoc,
  c: { artboard?: string; object: string; target: string; distance: number; mode?: 'closer' | 'further' | 'exact'; strength?: number },
) {
  const { ab, o } = getObject(doc, c.object, c.artboard);
  const target = getObject(doc, c.target, ab.id).o;
  const con = obj('DistanceConstraint', {
    name: 'Distance',
    parentId: o.id,
    targetId: target.id,
    distance: c.distance,
    modeValue: c.mode === 'further' ? 1 : c.mode === 'exact' ? 2 : 0,
    strength: c.strength ?? 1,
  });
  ab.objects.push(con);
  return con;
}

/** Clips `object` (and its children) to the shape `source`. */
export function addClip(doc: RiveDoc, c: { artboard?: string; object: string; source: string }) {
  const { ab, o } = getObject(doc, c.object, c.artboard);
  const source = getObject(doc, c.source, ab.id).o;
  if (source.id === o.id) throw new ApiError('An object cannot be its own mask');
  // the mask must live outside what it clips, or the runtime clips it away too
  const visited = new Set<string>();
  for (let parent: CoreObj | undefined = source; parent; parent = findObj(ab, String(parent.props.parentId ?? ''))) {
    if (visited.has(parent.id)) throw new ApiError('The object hierarchy contains a parent cycle');
    visited.add(parent.id);
    if (parent.id === o.id) throw new ApiError('The mask cannot be inside the object it masks');
  }
  const existing = clipsOf(ab, o.id).find((x) => x.props.sourceId === source.id);
  if (existing) return existing;
  const clip = obj('ClippingShape', { name: 'Clip', parentId: o.id, sourceId: source.id, fillRule: 0, isVisible: true });
  ab.objects.push(clip);
  return clip;
}

/** The masks applied to an object. */
export function clipsOf(ab: ArtboardDoc, objectId: string): CoreObj[] {
  return ab.objects.filter((c) => c.type === 'ClippingShape' && c.props.parentId === objectId);
}

/** Removes one mask, or every mask of an object when no clip id is given. */
export function removeClip(doc: RiveDoc, c: { artboard?: string; object: string; clipId?: string }) {
  const { ab, o } = getObject(doc, c.object, c.artboard);
  const doomed = new Set(clipsOf(ab, o.id).filter((x) => !c.clipId || x.id === c.clipId).map((x) => x.id));
  ab.objects = ab.objects.filter((x) => !doomed.has(x.id));
  return doomed.size;
}

// ---------------------------------------------------------------------------
// Themes

export function defineColor(doc: RiveDoc, name: string, color: string | number) {
  ensureEditorMeta(doc);
  const existing = doc.editor!.swatches.find((s) => s.name === name);
  if (existing) {
    doc.editor!.themes.find((t) => t.id === doc.editor!.activeThemeId)!.colors[existing.id] = parseColor(color);
    applyTheme(doc);
    return existing;
  }
  return addSwatch(doc, name, parseColor(color));
}

/** Binds a shape's fill/stroke (or text color) to a named theme color. */
export function applyThemeColor(doc: RiveDoc, ref: string, swatchName: string, kind: 'Fill' | 'Stroke' = 'Fill') {
  const { ab, o } = getObject(doc, ref);
  const swatch = doc.editor?.swatches.find((s) => s.name === swatchName || s.id === swatchName);
  if (!swatch) throw new ApiError(`Theme color "${swatchName}" not defined`);
  const solid = fillColorObject(ab, o, kind);
  if (!solid) throw new ApiError(`"${ref}" has no ${kind.toLowerCase()}`);
  bindColor(solid, 'colorValue', swatch.id);
  applyTheme(doc);
}

// ---------------------------------------------------------------------------
// Outline (for listing / AI context)

export function outline(doc: RiveDoc) {
  const describe = (ab: ArtboardDoc, o: CoreObj): Record<string, unknown> => {
    const d: Record<string, unknown> = { id: o.id, type: o.type };
    if (o.props.name) d.name = o.props.name;
    if ((isA(o.type, 'Node') || isA(o.type, 'Bone')) && o.type !== 'Artboard') {
      if (isA(o.type, 'Node') || o.type === 'RootBone') {
        d.x = round(prop(o, 'x'));
        d.y = round(prop(o, 'y'));
      }
      const r = prop(o, 'rotation');
      if (r) d.rotationDegrees = round((r * 180) / Math.PI);
      if (prop(o, 'scaleX') !== 1 || prop(o, 'scaleY') !== 1) d.scale = [round(prop(o, 'scaleX')), round(prop(o, 'scaleY'))];
      if (prop(o, 'opacity') !== 1) d.opacity = round(prop(o, 'opacity'));
    }
    if (isA(o.type, 'Bone')) d.length = round(prop(o, 'length'));
    if (isA(o.type, 'ParametricPath')) {
      d.width = round(prop(o, 'width'));
      d.height = round(prop(o, 'height'));
    }
    if (o.type === 'Shape' || o.type === 'Text') {
      const f = fillColorObject(ab, o);
      if (f) d.fill = formatColor(prop(f, 'colorValue'));
      const s = fillColorObject(ab, o, 'Stroke');
      if (s) d.stroke = formatColor(prop(s, 'colorValue'));
    }
    if (o.type === 'Text') d.text = textRuns(ab, o.id).map((r) => r.props.text).join('');
    if (o.type === 'PointsPath' || o.type === 'Mesh') {
      const skin = childrenOf(ab, o.id).find((object) => object.type === 'Skin');
      const tendons = skin ? childrenOf(ab, skin.id).filter((object) => object.type === 'Tendon') : [];
      if (skin) d.skin = { id: skin.id, bones: tendons.map((tendon, index) => ({ index: index + 1, boneId: tendon.props.boneId })) };
      d.vertices = childrenOf(ab, o.id).filter((object) => isA(object.type, 'Vertex')).map((vertex) => {
        const weight = childrenOf(ab, vertex.id).find((object) => isA(object.type, 'Weight'));
        return { id: vertex.id, type: vertex.type, x: prop(vertex, 'x'), y: prop(vertex, 'y'), ...(weight ? { influences: readWeights(weight, 'point'), ...(weight.type === 'CubicWeight' ? { inInfluences: readWeights(weight, 'in'), outInfluences: readWeights(weight, 'out') } : {}) } : {}) };
      });
    }
    const constraints = ab.objects.filter((item) => isA(item.type, 'Constraint') && item.props.parentId === o.id);
    if (constraints.length) d.constraints = constraints.map((constraint) => ({
      id: constraint.id,
      type: constraint.type,
      target: ab.objects.find((item) => item.id === constraint.props.targetId)?.props.name,
      distance: constraint.type === 'DistanceConstraint' ? constraint.props.distance : undefined,
      mode: constraint.type === 'DistanceConstraint' ? ['closer', 'further', 'exact'][Number(constraint.props.modeValue ?? 0)] : undefined,
      strength: constraint.props.strength,
    }));
    const kids = childrenOf(ab, o.id).filter((c) => isA(c.type, 'Node') || isA(c.type, 'Bone') || c.type === 'Mesh' || c.type === 'Text');
    if (kids.length) d.children = kids.map((c) => describe(ab, c));
    return d;
  };
  return {
    artboards: doc.artboards.map((ab) => ({
      id: ab.id,
      name: ab.artboard.props.name,
      width: prop(ab.artboard, 'width'),
      height: prop(ab.artboard, 'height'),
      viewModel: artboardViewModel(doc, ab)?.name,
      events: ab.objects.filter((o) => o.type === 'Event').map((event) => ({
        id: event.id,
        name: event.props.name,
        properties: ab.objects.filter((field) => field.props.parentId === event.id && isA(field.type, 'CustomProperty')).map((field) => ({ name: field.props.name, type: field.type.replace('CustomProperty', '').toLowerCase(), value: field.props.propertyValue })),
      })),
      children: childrenOf(ab, ab.artboard.id)
        .filter((c) => isA(c.type, 'Node') || isA(c.type, 'Bone') || c.type === 'Text')
        .map((c) => describe(ab, c)),
      timelines: ab.animations.map((a) => {
        const keyed: string[] = [];
        for (const ko of a.children ?? []) {
          const t = findObj(ab, ko.props.objectId as string);
          // colors are keyed on the paint's SolidColor: report them as owner.fill / owner.stroke
          let label = `${t?.props.name ?? t?.type ?? '?'}`;
          let colorAlias: string | null = null;
          if (t?.type === 'SolidColor') {
            const paint = findObj(ab, t.props.parentId as string);
            let owner = paint ? findObj(ab, paint.props.parentId as string) : undefined;
            if (owner && isA(owner.type, 'TextStyle')) owner = findObj(ab, owner.props.parentId as string);
            label = String(owner?.props.name ?? owner?.type ?? '?');
            colorAlias = paint?.type === 'Stroke' ? 'stroke' : 'fill';
          }
          for (const kp of ko.children ?? []) keyed.push(`${label}.${colorAlias && propNameOf(kp) === 'colorValue' ? colorAlias : propNameOf(kp)}`);
        }
        return {
          id: a.id,
          name: a.props.name,
          fps: prop(a, 'fps'),
          durationSeconds: round(prop(a, 'duration') / (prop(a, 'fps') || 60)),
          loop: ['oneShot', 'loop', 'pingPong'][prop(a, 'loopValue')] ?? 'loop',
          keyed,
        };
      }),
      properties: dataProperties(doc, ab).map((p) => ({ id: p.obj.id, name: p.name, type: p.type, value: propertyValue(p) })),
      stateMachines: ab.stateMachines.map((sm) => ({
        id: sm.id,
        name: sm.props.name,
        inputs: (sm.children ?? [])
          .filter((c) => isA(c.type, 'StateMachineInput'))
          .map((i) => ({ id: i.id, name: i.props.name, type: i.type.replace('StateMachine', '').toLowerCase() })),
        layers: (sm.children ?? [])
          .filter((c) => isA(c.type, 'StateMachineLayer'))
          .map((l) => ({
            name: l.props.name,
            states: (l.children ?? []).map((st) => ({
              id: st.id,
              type: st.type,
              timeline: st.type === 'AnimationState' ? ab.animations.find((a) => a.id === st.props.animationId)?.props.name : undefined,
              blend: st.type === 'BlendState1DInput' ? (st.children ?? []).map((entry) => ({ timeline: ab.animations.find((a) => a.id === entry.props.animationId)?.props.name, value: entry.props.value })) : undefined,
              transitionsTo: (st.children ?? []).filter((c) => isA(c.type, 'StateTransition')).map((tr) => tr.props.stateToId),
            })),
          })),
        listeners: (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineListener')).length,
      })),
    })),
    themeColors: (doc.editor?.swatches ?? []).map((s) => ({
      name: s.name,
      color: formatColor(doc.editor!.themes.find((t) => t.id === doc.editor!.activeThemeId)?.colors[s.id] ?? 0),
    })),
    themes: (doc.editor?.themes ?? []).map((t) => ({ name: t.name, active: t.id === doc.editor?.activeThemeId })),
  };
}

function propNameOf(kp: CoreObj): string {
  return propDefByKey(prop(kp, 'propertyKey'))?.name ?? `#${prop(kp, 'propertyKey')}`;
}

const round = (v: number) => Math.round(v * 100) / 100;

