// Structural edit operations on an (immer draft) document.
import { ArtboardDoc, CoreObj, deepClone, newId, RiveDoc } from './document';
import { obj } from './factory';
import { apply, buildScene, compose, invert, Mat, mul, prop } from './scene';
import { defaultValue, isA, propDef, propDefByKey } from './schema';

export function findArtboard(doc: RiveDoc, id: string | null | undefined): ArtboardDoc | undefined {
  return doc.artboards.find((a) => a.id === id);
}

export function findObj(ab: ArtboardDoc, id: string): CoreObj | undefined {
  if (ab.artboard.id === id) return ab.artboard;
  return ab.objects.find((o) => o.id === id);
}

export function parentIdOf(ab: ArtboardDoc, o: CoreObj): string | null {
  if (o.type === 'Artboard' || !isA(o.type, 'Component')) return null;
  const p = o.props.parentId;
  return typeof p === 'string' ? p : ab.artboard.id;
}

export function childrenOf(ab: ArtboardDoc, id: string): CoreObj[] {
  return ab.objects.filter((o) => parentIdOf(ab, o) === id);
}

export function descendantIds(ab: ArtboardDoc, id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of ab.objects) {
      const p = parentIdOf(ab, o);
      if (p && out.has(p) && !out.has(o.id)) {
        out.add(o.id);
        grew = true;
      }
    }
  }
  return out;
}

export function isAncestor(ab: ArtboardDoc, ancestorId: string, id: string): boolean {
  let cur: string | null = id;
  let guard = 0;
  while (cur && guard++ < 1000) {
    if (cur === ancestorId) return true;
    const o = findObj(ab, cur);
    cur = o ? parentIdOf(ab, o) : null;
  }
  return false;
}

/** Walk all nested stream children of an object (keyed data, SM parts). */
export function walkTree(o: CoreObj, fn: (o: CoreObj, parent: CoreObj | null) => void, parent: CoreObj | null = null) {
  fn(o, parent);
  for (const c of o.children ?? []) walkTree(c, fn, o);
}

/** Insert new objects so their top-most sibling sits in front of existing siblings. */
export function insertObjects(ab: ArtboardDoc, objs: CoreObj[], beforeId?: string | null) {
  if (!objs.length) return;
  const first = objs[0];
  const parentId = parentIdOf(ab, first);
  let index = -1;
  if (beforeId) index = ab.objects.findIndex((o) => o.id === beforeId);
  if (index < 0 && parentId) {
    index = ab.objects.findIndex((o) => parentIdOf(ab, o) === parentId && isA(o.type, 'TransformComponent'));
    // earlier objects draw on top: keep children of a drawable (e.g. a label
    // inside a shape) in front of their parent
    const parent = ab.objects.findIndex((o) => o.id === parentId);
    if (parent >= 0 && isA(ab.objects[parent].type, 'Drawable') && (index < 0 || parent < index)) index = parent;
    // first child of a group: keep it next to the group instead of at the very end (the back)
    if (index < 0 && parent >= 0) index = parent + 1;
  }
  if (index < 0) ab.objects.push(...objs);
  else ab.objects.splice(index, 0, ...objs);
}

export function deleteObjects(ab: ArtboardDoc, ids: string[]) {
  const doomed = new Set<string>();
  for (const id of ids) {
    if (id === ab.artboard.id) continue;
    for (const d of descendantIds(ab, id)) doomed.add(d);
  }
  // interpolators referenced only by doomed keyframes are cleaned up by cleanupInterpolators
  ab.objects = ab.objects.filter((o) => !doomed.has(o.id));
  for (const anim of ab.animations) {
    anim.children = (anim.children ?? []).filter(
      (ko) => !(ko.type === 'KeyedObject' && typeof ko.props.objectId === 'string' && doomed.has(ko.props.objectId)),
    );
  }
  for (const sm of ab.stateMachines) {
    for (const c of sm.children ?? []) {
      if (isA(c.type, 'StateMachineListener') && typeof c.props.targetId === 'string' && doomed.has(c.props.targetId)) {
        delete c.props.targetId;
      }
    }
  }
  cleanupInterpolators(ab);
}

export function cleanupInterpolators(ab: ArtboardDoc) {
  const used = new Set<string>();
  const collect = (o: CoreObj) => {
    if (typeof o.props.interpolatorId === 'string') used.add(o.props.interpolatorId);
  };
  for (const a of ab.animations) walkTree(a, collect);
  for (const s of ab.stateMachines) walkTree(s, collect);
  ab.objects = ab.objects.filter((o) => !isA(o.type, 'KeyFrameInterpolator') || used.has(o.id));
}

// ---------------------------------------------------------------------------
// Transforms

export function decompose(m: Mat) {
  const x = m[4];
  const y = m[5];
  const sx = Math.hypot(m[0], m[1]);
  const rotation = Math.atan2(m[1], m[0]);
  const det = m[0] * m[3] - m[1] * m[2];
  const sy = sx ? det / sx : Math.hypot(m[2], m[3]);
  return { x, y, rotation, scaleX: sx, scaleY: sy };
}

/** Moves an object under a new parent while keeping its world transform. */
export function reparent(ab: ArtboardDoc, id: string, newParentId: string, beforeId?: string | null) {
  const o = findObj(ab, id);
  if (!o || o.type === 'Artboard' || isAncestor(ab, id, newParentId)) return;
  const scene = buildScene(ab);
  const world = scene.nodes.get(id)?.world;
  const parentWorld = scene.nodes.get(newParentId)?.world;
  o.props.parentId = newParentId;
  if (world && parentWorld && isA(o.type, 'Node')) {
    const local = decompose(mul(invert(parentWorld), world));
    o.props.x = local.x;
    o.props.y = local.y;
    o.props.rotation = local.rotation;
    o.props.scaleX = local.scaleX;
    o.props.scaleY = local.scaleY;
  }
  moveBefore(ab, id, beforeId ?? null, newParentId);
}

/**
 * Moves `id` and all of its descendants (keeping their relative order) so the
 * subtree sits right before `beforeId`, or after the last sibling when null.
 * Object order is draw order, so subtrees are always moved as a block.
 */
export function moveBefore(ab: ArtboardDoc, id: string, beforeId: string | null, parentId?: string) {
  const item = ab.objects.find((o) => o.id === id);
  if (!item) return;
  const subtree = descendantIds(ab, id);
  if (beforeId && subtree.has(beforeId)) return;
  const block = ab.objects.filter((o) => subtree.has(o.id));
  const rest = ab.objects.filter((o) => !subtree.has(o.id));
  let to = beforeId ? rest.findIndex((o) => o.id === beforeId) : -1;
  if (to < 0) {
    // after the last object belonging to the parent's subtree
    const pid = parentId ?? parentIdOf(ab, item);
    let last = -1;
    if (pid) {
      const parentTree = descendantIds({ ...ab, objects: rest }, pid);
      rest.forEach((o, i) => {
        if (parentTree.has(o.id) && o.id !== pid) last = i;
      });
      if (last < 0) last = rest.findIndex((o) => o.id === pid);
    }
    to = last < 0 ? rest.length : last + 1;
  }
  rest.splice(to, 0, ...block);
  ab.objects = rest;
}

export function groupObjects(ab: ArtboardDoc, ids: string[]): string | null {
  const objs = ids.map((id) => findObj(ab, id)).filter((o): o is CoreObj => !!o && isA(o.type, 'Node'));
  if (!objs.length) return null;
  const parentId = parentIdOf(ab, objs[0]) ?? ab.artboard.id;
  const scene = buildScene(ab);
  const parentWorld = scene.nodes.get(parentId)?.world ?? [1, 0, 0, 1, 0, 0];
  // place the group at the center of the selection
  let cx = 0;
  let cy = 0;
  for (const o of objs) {
    const w = scene.nodes.get(o.id)!.world;
    const [lx, ly] = apply(invert(parentWorld), w[4], w[5]);
    cx += lx;
    cy += ly;
  }
  cx /= objs.length;
  cy /= objs.length;
  const group = obj('Node', { name: 'Group', parentId, x: cx, y: cy });
  insertObjects(ab, [group], objs[0].id);
  for (const o of objs) reparent(ab, o.id, group.id);
  return group.id;
}

/** Deep clones subtrees (objects + their keyframes in every animation). */
export function duplicateObjects(ab: ArtboardDoc, ids: string[]): string[] {
  const roots = ids.filter((id) => !ids.some((other) => other !== id && isAncestor(ab, other, id)));
  const newRoots: string[] = [];
  for (const rootId of roots) {
    const all = descendantIds(ab, rootId);
    const map = new Map<string, string>();
    for (const id of all) map.set(id, newId());
    const clones: CoreObj[] = [];
    for (const o of ab.objects) {
      if (!all.has(o.id)) continue;
      const c = deepClone(o) as CoreObj;
      c.id = map.get(o.id)!;
      // remap every reference inside the copied subtree (parentId, styleId, sourceId, ...)
      for (const [k, v] of Object.entries(c.props)) if (typeof v === 'string' && map.has(v)) c.props[k] = map.get(v);
      if (c.id === map.get(rootId) && typeof c.props.name === 'string') c.props.name = `${c.props.name} Copy`;
      clones.push(c);
    }
    insertObjects(ab, clones, rootId);
    for (const anim of ab.animations) {
      const extra: CoreObj[] = [];
      for (const ko of anim.children ?? []) {
        if (ko.type !== 'KeyedObject' || typeof ko.props.objectId !== 'string' || !map.has(ko.props.objectId)) continue;
        const c = deepClone(ko) as CoreObj;
        walkTree(c, (n) => (n.id = newId()));
        c.props.objectId = map.get(ko.props.objectId);
        extra.push(c);
      }
      anim.children = [...(anim.children ?? []), ...extra];
    }
    newRoots.push(map.get(rootId)!);
  }
  return newRoots;
}

// ---------------------------------------------------------------------------
// Keyframes

export const KEYFRAME_TYPE: Record<string, string> = {
  double: 'KeyFrameDouble',
  color: 'KeyFrameColor',
  bool: 'KeyFrameBool',
  id: 'KeyFrameId',
  string: 'KeyFrameString',
};

export function isAnimatable(type: string, propName: string): boolean {
  const pd = propDef(type, propName);
  if (!pd) return false;
  if (propName === 'parentId' || propName === 'name') return false;
  return pd.type === 'double' || pd.type === 'color' || pd.type === 'bool';
}

export function keyedPropertyFor(anim: CoreObj, objId: string, propKey: number): CoreObj | undefined {
  const ko = anim.children?.find((k) => k.type === 'KeyedObject' && k.props.objectId === objId);
  return ko?.children?.find((kp) => kp.props.propertyKey === propKey);
}

export function isKeyed(anim: CoreObj | undefined, objId: string, type: string, propName: string) {
  if (!anim) return false;
  const pd = propDef(type, propName);
  return !!pd && !!keyedPropertyFor(anim, objId, pd.key)?.children?.length;
}

export function keyframeAt(anim: CoreObj | undefined, objId: string, type: string, propName: string, frame: number) {
  if (!anim) return undefined;
  const pd = propDef(type, propName);
  if (!pd) return undefined;
  return keyedPropertyFor(anim, objId, pd.key)?.children?.find((k) => prop(k, 'frame') === frame);
}

export function upsertKeyframe(
  anim: CoreObj,
  target: CoreObj,
  propName: string,
  value: unknown,
  frame: number,
  interpolationType = 1,
): CoreObj | undefined {
  const pd = propDef(target.type, propName);
  if (!pd) return;
  const kfType = KEYFRAME_TYPE[pd.type];
  if (!kfType) return;
  anim.children ??= [];
  let ko = anim.children.find((k) => k.type === 'KeyedObject' && k.props.objectId === target.id);
  if (!ko) {
    ko = obj('KeyedObject', { objectId: target.id }, []);
    anim.children.push(ko);
  }
  ko.children ??= [];
  let kp = ko.children.find((k) => k.props.propertyKey === pd.key);
  if (!kp) {
    kp = obj('KeyedProperty', { propertyKey: pd.key }, []);
    ko.children.push(kp);
  }
  kp.children ??= [];
  let kf = kp.children.find((k) => prop(k, 'frame') === frame);
  if (!kf) {
    // new keys inherit the interpolation of the key before them
    const prev = [...kp.children]
      .filter((k) => prop(k, 'frame') < frame)
      .sort((a, b) => prop(b, 'frame') - prop(a, 'frame'))[0];
    kf = obj(kfType, {
      frame,
      interpolationType: prev ? prop(prev, 'interpolationType') : interpolationType,
      ...(prev && typeof prev.props.interpolatorId === 'string' ? { interpolatorId: prev.props.interpolatorId } : {}),
    });
    kp.children.push(kf);
    kp.children.sort((a, b) => prop(a, 'frame') - prop(b, 'frame'));
  }
  kf.props.value = value;
  return kf;
}

export function removeKeyframes(ab: ArtboardDoc, anim: CoreObj, ids: Set<string>) {
  for (const ko of anim.children ?? []) {
    for (const kp of ko.children ?? []) kp.children = (kp.children ?? []).filter((k) => !ids.has(k.id));
    ko.children = (ko.children ?? []).filter((kp) => (kp.children ?? []).length > 0);
  }
  anim.children = (anim.children ?? []).filter((ko) => ko.type !== 'KeyedObject' || (ko.children ?? []).length > 0);
  cleanupInterpolators(ab);
}

export function allKeyframes(anim: CoreObj): { kf: CoreObj; kp: CoreObj; ko: CoreObj }[] {
  const out: { kf: CoreObj; kp: CoreObj; ko: CoreObj }[] = [];
  for (const ko of anim.children ?? []) {
    if (ko.type !== 'KeyedObject') continue;
    for (const kp of ko.children ?? []) for (const kf of kp.children ?? []) out.push({ kf, kp, ko });
  }
  return out;
}

export function propNameForKey(key: number): string {
  return propDefByKey(key)?.name ?? `#${key}`;
}

export const EASE_PRESETS: Record<string, [number, number, number, number]> = {
  'Ease In Out': [0.42, 0, 0.58, 1],
  'Ease In': [0.42, 0, 1, 1],
  'Ease Out': [0, 0, 0.58, 1],
  'Ease In Back': [0.36, 0, 0.66, -0.56],
  'Ease Out Back': [0.34, 1.56, 0.64, 1],
  'Ease In Out Back': [0.68, -0.6, 0.32, 1.6],
  Smooth: [0.25, 0.1, 0.25, 1],
};

/** Sets interpolation on keyframes: 'hold' | 'linear' | 'cubic' with bezier values. */
export function setInterpolation(
  ab: ArtboardDoc,
  kfs: CoreObj[],
  mode: 'hold' | 'linear' | 'cubic',
  bezier: [number, number, number, number] = EASE_PRESETS['Ease In Out'],
) {
  for (const kf of kfs) {
    if (mode === 'hold') {
      kf.props.interpolationType = 0;
      delete kf.props.interpolatorId;
    } else if (mode === 'linear') {
      kf.props.interpolationType = 1;
      delete kf.props.interpolatorId;
    } else {
      kf.props.interpolationType = 2;
      let interp = typeof kf.props.interpolatorId === 'string' ? findObj(ab, kf.props.interpolatorId) : undefined;
      // don't mutate an interpolator shared with keys outside this selection
      const shared =
        interp &&
        ab.animations.some((a) =>
          allKeyframes(a).some(({ kf: other }) => other.props.interpolatorId === interp!.id && !kfs.includes(other)),
        );
      if (!interp || shared) {
        interp = obj('CubicEaseInterpolator', {});
        ab.objects.push(interp);
        kf.props.interpolatorId = interp.id;
      }
      [interp.props.x1, interp.props.y1, interp.props.x2, interp.props.y2] = bezier;
    }
  }
  cleanupInterpolators(ab);
}

export function colorToHex(c: number) {
  return '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}
export function colorAlpha(c: number) {
  return ((c >>> 24) & 255) / 255;
}
export function hexToColor(hex: string, alpha = 1) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return ((Math.round(alpha * 255) << 24) | v) >>> 0;
}
export function colorCss(c: number) {
  const a = colorAlpha(c);
  return `rgba(${(c >>> 16) & 255},${(c >>> 8) & 255},${c & 255},${a})`;
}

export function propValue(o: CoreObj, name: string) {
  return o.props[name] ?? defaultValue(o.type, name);
}

export { compose };

// ---------------------------------------------------------------------------
// Ungroup, z-order, clipboard

/** Moves a group's children to the group's parent (keeping world transforms) and removes the group. */
export function ungroup(ab: ArtboardDoc, groupId: string): string[] {
  const g = findObj(ab, groupId);
  if (!g || g.type !== 'Node') return [];
  const parentId = parentIdOf(ab, g) ?? ab.artboard.id;
  const kids = childrenOf(ab, groupId).map((c) => c.id);
  for (const id of kids) reparent(ab, id, parentId, groupId);
  // keyframes on the group are dropped together with it
  deleteObjects(ab, [groupId]);
  return kids;
}

/** Changes stacking among siblings. Earlier siblings draw on top. */
export function reorder(ab: ArtboardDoc, id: string, how: 'forward' | 'backward' | 'front' | 'back') {
  const o = findObj(ab, id);
  if (!o || o.type === 'Artboard') return;
  const parentId = parentIdOf(ab, o) ?? ab.artboard.id;
  const sibs = childrenOf(ab, parentId).filter((c) => isA(c.type, 'TransformComponent'));
  const i = sibs.findIndex((c) => c.id === id);
  if (i < 0) return;
  if (how === 'front' && i > 0) moveBefore(ab, id, sibs[0].id, parentId);
  else if (how === 'forward' && i > 0) moveBefore(ab, id, sibs[i - 1].id, parentId);
  else if (how === 'backward' && i < sibs.length - 1) moveBefore(ab, id, sibs[i + 2]?.id ?? null, parentId);
  else if (how === 'back' && i < sibs.length - 1) moveBefore(ab, id, null, parentId);
}

export interface ClipboardData {
  kind: 'openrive/objects';
  /** subtree objects in draw order; roots have parentId pointing outside the set */
  objects: CoreObj[];
  roots: string[];
  /** font assets referenced by copied text */
  fonts: CoreObj[];
}

export function copyObjects(doc: RiveDoc, ab: ArtboardDoc, ids: string[]): ClipboardData | null {
  const roots = ids.filter((id) => id !== ab.artboard.id && !ids.some((o) => o !== id && isAncestor(ab, o, id)));
  if (!roots.length) return null;
  const all = new Set<string>();
  for (const r of roots) for (const d of descendantIds(ab, r)) all.add(d);
  const objects = ab.objects.filter((o) => all.has(o.id)).map((o) => deepClone(o) as CoreObj);
  const fontIds = new Set(objects.map((o) => o.props.fontAssetId).filter((v): v is string => typeof v === 'string'));
  const fonts = doc.top.filter((o) => fontIds.has(o.id)).map((o) => deepClone(o) as CoreObj);
  return { kind: 'openrive/objects', objects, roots, fonts };
}

/** Pastes clipboard objects under `parentId` with fresh ids. Returns the new root ids. */
export function pasteObjects(doc: RiveDoc, ab: ArtboardDoc, clip: ClipboardData, parentId: string, offset = 0): string[] {
  const map = new Map<string, string>();
  for (const o of clip.objects) map.set(o.id, newId());
  // fonts: reuse an existing asset with the same name, else add it
  for (const f of clip.fonts) {
    const existing = doc.top.find((o) => o.type === 'FontAsset' && (o.id === f.id || o.props.name === f.props.name));
    if (existing) map.set(f.id, existing.id);
    else {
      const copy = deepClone(f) as CoreObj;
      walkTree(copy, (n) => (n.id = newId()));
      doc.top.splice(doc.top.findIndex((o) => o.type === 'Backboard') + 1, 0, copy);
      map.set(f.id, copy.id);
    }
  }
  const swatches = new Set((doc.editor?.swatches ?? []).map((s) => s.id));
  const roots = new Set(clip.roots);
  const pasted = clip.objects.map((o) => {
    const c = deepClone(o) as CoreObj;
    c.id = map.get(o.id)!;
    for (const [k, v] of Object.entries(c.props)) {
      if (typeof v === 'string' && map.has(v)) c.props[k] = map.get(v);
    }
    if (roots.has(o.id)) {
      c.props.parentId = parentId;
      if (offset && isA(c.type, 'Node')) {
        c.props.x = prop(c, 'x') + offset;
        c.props.y = prop(c, 'y') + offset;
      }
    } else if (typeof c.props.parentId === 'string' && !map.has(o.props.parentId as string)) {
      c.props.parentId = parentId;
    }
    // drop theme bindings to swatches this file doesn't have
    const bind = c.ui?.bind as Record<string, string> | undefined;
    if (bind) for (const [p, s] of Object.entries(bind)) if (!swatches.has(s)) delete bind[p];
    return c;
  });
  insertObjects(ab, pasted);
  return clip.roots.map((r) => map.get(r)!);
}
