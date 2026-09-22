// High-level document operations with friendly inputs (names or ids, CSS
// colors, seconds or frames). Used by templates, the CLI and the MCP server,
// so humans and AI agents build files through the same code as the editor.
import { ArtboardDoc, CoreObj, RiveDoc } from './document';
import { newAnimation, newArtboard, newLayer, newParametricShape, newPenShape, obj, PenPoint, ShapeKind, solidFill, solidStroke } from './factory';
import { childrenOf, EASE_PRESETS, findObj, insertObjects, isAnimatable, parentIdOf, setInterpolation, upsertKeyframe } from './ops';
import { artboardPos, prop } from './scene';
import { isA, propDef, propDefByKey } from './schema';
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
  const objs = newParametricShape(s.kind, parentId, s.x, s.y, s.width, s.height, s.fill ? parseColor(s.fill) : 0xffc4c4c4);
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
  if (p.fill !== undefined || p.closed !== false) objs.push(...solidFill(shape.id, parseColor(p.fill ?? '#c4c4c4')));
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
    const doomed = new Set<string>([o.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of ab.objects) {
        const p = parentIdOf(ab, c);
        if (p && doomed.has(p) && !doomed.has(c.id)) {
          doomed.add(c.id);
          grew = true;
        }
      }
    }
    ab.objects = ab.objects.filter((c) => !doomed.has(c.id));
    for (const a of ab.animations) a.children = (a.children ?? []).filter((ko) => !doomed.has(ko.props.objectId as string));
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

export interface ConditionInput {
  input: string;
  /** for numbers: == != < <= > >= ; for booleans: value true/false ; triggers need neither */
  op?: '==' | '!=' | '<' | '<=' | '>' | '>=';
  value?: number | boolean;
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
    const input = inputs.find((i) => i.id === c.input || i.props.name === c.input);
    if (!input) throw new ApiError(`Input "${c.input}" not found`);
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
    event: 'down' | 'up' | 'click' | 'enter' | 'exit' | 'move';
    name?: string;
    /** input changes, or { alignTarget } to move an object to the pointer (e.g. eyes following the cursor) */
    actions: ({ input: string; value?: number | boolean | 'toggle' } | { alignTarget: string; preserveOffset?: boolean })[];
  },
) {
  const ab = getArtboard(doc, l.artboard);
  const sm = getStateMachine(ab, l.stateMachine);
  const inputs = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineInput'));
  const events = { enter: 0, exit: 1, down: 2, up: 3, move: 4, click: 6 };
  const target = l.target ? getObject(doc, l.target, ab.id).o : undefined;
  const actions = l.actions.map((a) => {
    if ('alignTarget' in a) {
      const t = getObject(doc, a.alignTarget, ab.id).o;
      return obj('ListenerAlignTarget', { targetId: t.id, ...(a.preserveOffset ? { preserveOffset: true } : {}) });
    }
    const input = inputs.find((i) => i.id === a.input || i.props.name === a.input);
    if (!input) throw new ApiError(`Input "${a.input}" not found`);
    if (input.type === 'StateMachineTrigger') return obj('ListenerTriggerChange', { inputId: input.id });
    if (input.type === 'StateMachineBool')
      return obj('ListenerBoolChange', { inputId: input.id, value: a.value === 'toggle' ? 2 : a.value === false ? 0 : 1 });
    return obj('ListenerNumberChange', { inputId: input.id, value: Number(a.value ?? 0) });
  });
  const listener = obj(
    'StateMachineListenerSingle',
    { name: l.name ?? 'Listener', listenerTypeValue: events[l.event], ...(target ? { targetId: target.id } : {}) },
    actions,
  );
  (sm.children ??= []).push(listener);
  return listener;
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
  const clip = obj('ClippingShape', { name: 'Clip', parentId: o.id, sourceId: source.id, fillRule: 0, isVisible: true });
  ab.objects.push(clip);
  return clip;
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
    if (isA(o.type, 'Node') && o.type !== 'Artboard') {
      d.x = round(prop(o, 'x'));
      d.y = round(prop(o, 'y'));
      const r = prop(o, 'rotation');
      if (r) d.rotationDegrees = round((r * 180) / Math.PI);
      if (prop(o, 'scaleX') !== 1 || prop(o, 'scaleY') !== 1) d.scale = [round(prop(o, 'scaleX')), round(prop(o, 'scaleY'))];
      if (prop(o, 'opacity') !== 1) d.opacity = round(prop(o, 'opacity'));
    }
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
    const kids = childrenOf(ab, o.id).filter((c) => isA(c.type, 'Node') || c.type === 'Text');
    if (kids.length) d.children = kids.map((c) => describe(ab, c));
    return d;
  };
  return {
    artboards: doc.artboards.map((ab) => ({
      id: ab.id,
      name: ab.artboard.props.name,
      width: prop(ab.artboard, 'width'),
      height: prop(ab.artboard, 'height'),
      children: childrenOf(ab, ab.artboard.id)
        .filter((c) => isA(c.type, 'Node') || c.type === 'Text')
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

