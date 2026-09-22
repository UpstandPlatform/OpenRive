// Editor document model for .riv files.
//
// A .riv file is a flat stream of core objects whose relationships are encoded
// as indices (e.g. Component.parentId is an index into the artboard's object
// list). Editing with indices is fragile, so on import every index reference
// is converted to a stable object id and the stream is grouped into
// artboards / animations / state machines. Export does the reverse.
import { nanoid } from 'nanoid';
import { DEFAULT_HEADER, RawObject, RawProp, readRiv, RivHeader, writeRiv } from './riv-format';
import { isA, typeDef, typeDefByKey, TypeDef } from './schema';

export interface CoreObj {
  id: string;
  /** Rive type name (e.g. "Shape"), or "#<typeKey>" if unknown to this editor */
  type: string;
  props: Record<string, unknown>;
  /** properties this editor doesn't know about, preserved verbatim */
  raw?: RawProp[];
  /** objects nested by stream order (keyed data, state machine parts, asset contents) */
  children?: CoreObj[];
  /** original property key order, kept when unknown props are interleaved with known ones */
  keyOrder?: number[];
  /** editor-only data (e.g. state positions in the graph); never written to .riv */
  ui?: { x?: number; y?: number; [k: string]: unknown };
}

export interface ArtboardDoc {
  id: string;
  artboard: CoreObj;
  /** components etc. in file order; hierarchy is expressed with props.parentId */
  objects: CoreObj[];
  animations: CoreObj[];
  stateMachines: CoreObj[];
}

export interface Swatch {
  id: string;
  name: string;
}

export interface Theme {
  id: string;
  name: string;
  /** swatch id -> ARGB color */
  colors: Record<string, number>;
}

/** Editor-only document data, saved with the project but never written to .riv */
export interface EditorMeta {
  swatches: Swatch[];
  themes: Theme[];
  activeThemeId: string;
  /** editor automation scripts (Code panel); never written to the .riv */
  scripts?: EditorScript[];
}

export interface EditorScript {
  id: string;
  name: string;
  code: string;
}

export interface RiveDoc {
  header: RivHeader;
  /** Backboard, file assets and other file level objects */
  top: CoreObj[];
  artboards: ArtboardDoc[];
  editor?: EditorMeta;
}

export const newId = () => nanoid(10);

// ---------------------------------------------------------------------------
// Reference tables: which properties hold indices, and into which list.

type RefSpace = 'component' | 'animation' | 'stateMachine' | 'state' | 'input' | 'asset' | 'artboard';

const REF_SPACES: Record<string, RefSpace> = {
  'Component.parentId': 'component',
  'KeyedObject.objectId': 'component',
  'ClippingShape.sourceId': 'component',
  'Tendon.boneId': 'component',
  'DrawTarget.drawableId': 'component',
  'DrawRules.drawTargetId': 'component',
  'InterpolatingKeyFrame.interpolatorId': 'component',
  'StateTransition.interpolatorId': 'component',
  'TargetedConstraint.targetId': 'component',
  'TextValueRun.styleId': 'component',
  'Solo.activeComponentId': 'component',
  'StateMachineListener.targetId': 'component',
  'ListenerAlignTarget.targetId': 'component',
  'StateMachineListenerSingle.eventId': 'component',
  'ListenerFireEvent.eventId': 'component',
  'StateMachineFireEvent.eventId': 'component',
  'LayoutComponent.styleId': 'component',
  'LayoutComponentStyle.interpolatorId': 'component',
  'TextModifierRange.runId': 'component',
  'Joystick.handleSourceId': 'component',
  'ListenerInputChange.nestedInputId': 'component',
  'KeyFrameId.value': 'component',
  'AnimationState.animationId': 'animation',
  'BlendAnimation.animationId': 'animation',
  'Joystick.xId': 'animation',
  'Joystick.yId': 'animation',
  'Artboard.defaultStateMachineId': 'stateMachine',
  'StateTransition.stateToId': 'state',
  'TransitionInputCondition.inputId': 'input',
  'ListenerInputChange.inputId': 'input',
  'BlendAnimationDirect.inputId': 'input',
  'BlendState1DInput.inputId': 'input',
  'Image.assetId': 'asset',
  'TextStyle.fontAssetId': 'asset',
  'AudioEvent.assetId': 'asset',
  'NestedArtboard.artboardId': 'artboard',
};

export function refSpaceOf(typeName: string, prop: string): RefSpace | undefined {
  const t = tryType(typeName);
  const p = t?.propsByName.get(prop);
  if (!p) return undefined;
  return REF_SPACES[`${p.owner}.${p.name}`];
}

function tryType(name: string): TypeDef | undefined {
  try {
    return typeDef(name);
  } catch {
    return undefined;
  }
}

/**
 * Objects that occupy a slot in an artboard's index space: components and
 * interpolators, plus anything the runtime can't instantiate (abstract or
 * unknown types are read as null objects, which still take a slot).
 */
export function isIndexable(type: string): boolean {
  const def = tryType(type);
  if (def && !def.instantiable) return true;
  return (
    isA(type, 'Component') ||
    isA(type, 'KeyFrameInterpolator') ||
    type === 'GamepadInput' ||
    type === 'KeyboardInput' ||
    type === 'SemanticInput' ||
    type.startsWith('#')
  );
}

// ---------------------------------------------------------------------------
// Import

function toCoreObj(o: RawObject): CoreObj {
  const def = typeDefByKey(o.typeKey);
  const obj: CoreObj = { id: newId(), type: def ? def.name : `#${o.typeKey}`, props: {} };
  for (const p of o.props) {
    const pd = def?.propsByKey.get(p.key);
    if (pd && p.cls === undefined) obj.props[pd.name] = p.value;
    else (obj.raw ??= []).push(p);
  }
  if (obj.raw && o.props.length > obj.raw.length) obj.keyOrder = o.props.map((p) => p.key);
  return obj;
}

export function importRiv(bytes: Uint8Array): RiveDoc {
  const raw = readRiv(bytes);
  const doc: RiveDoc = { header: raw.header, top: [], artboards: [] };

  let ab: ArtboardDoc | null = null;
  let lastAsset: CoreObj | null = null;
  let lastAnim: CoreObj | null = null;
  let lastKO: CoreObj | null = null;
  let lastKP: CoreObj | null = null;
  let lastSM: CoreObj | null = null;
  let lastLayer: CoreObj | null = null;
  let lastState: CoreObj | null = null;
  let lastTransition: CoreObj | null = null;
  let lastLayerComp: CoreObj | null = null;
  let lastListener: CoreObj | null = null;
  let lastTreeObj: CoreObj | null = null;

  // per-artboard index lists used to resolve references afterwards
  interface AbIndex {
    components: CoreObj[];
    animations: CoreObj[];
    stateMachines: CoreObj[];
  }
  const abIndex = new Map<ArtboardDoc, AbIndex>();
  const assets: CoreObj[] = [];
  const kids = (o: CoreObj | null) => (o ? (o.children ??= []) : null);

  for (const r of raw.objects) {
    const o = toCoreObj(r);
    const t = o.type;
    if (t === 'Artboard') {
      ab = { id: o.id, artboard: o, objects: [], animations: [], stateMachines: [] };
      doc.artboards.push(ab);
      abIndex.set(ab, { components: [o], animations: [], stateMachines: [] });
      lastAnim = lastKO = lastKP = lastSM = lastLayer = lastState = lastTransition = null;
      lastLayerComp = lastListener = lastTreeObj = null;
      continue;
    }
    if (isA(t, 'FileAsset')) {
      doc.top.push(o);
      assets.push(o);
      lastAsset = o;
      continue;
    }
    if (t === 'FileAssetContents' && lastAsset) {
      kids(lastAsset)!.push(o);
      continue;
    }
    if (!ab) {
      doc.top.push(o);
      continue;
    }
    const idx = abIndex.get(ab)!;
    const inTree = (list: CoreObj[] | null | undefined) => {
      if (!list) return false;
      list.push(o);
      lastTreeObj = o;
      return true;
    };
    if (isA(t, 'LinearAnimation')) {
      ab.animations.push(o);
      idx.animations.push(o);
      lastAnim = lastTreeObj = o;
      lastKO = lastKP = null;
    } else if (t === 'KeyedObject' && inTree(kids(lastAnim))) {
      lastKO = o;
      lastKP = null;
    } else if (t === 'KeyedProperty' && inTree(kids(lastKO))) {
      lastKP = o;
    } else if (isA(t, 'KeyFrame') && inTree(kids(lastKP))) {
      // keyframe
    } else if (isA(t, 'StateMachine')) {
      ab.stateMachines.push(o);
      idx.stateMachines.push(o);
      lastSM = lastTreeObj = o;
      lastAnim = lastLayer = lastState = lastTransition = lastListener = lastLayerComp = null;
    } else if (isA(t, 'StateMachineLayer') && inTree(kids(lastSM))) {
      lastLayer = o;
      lastState = lastTransition = lastLayerComp = null;
    } else if (isA(t, 'LayerState') && inTree(kids(lastLayer))) {
      lastState = lastLayerComp = o;
      lastTransition = null;
    } else if (isA(t, 'StateTransition') && inTree(kids(lastState))) {
      lastTransition = lastLayerComp = o;
    } else if (isA(t, 'TransitionCondition') && inTree(kids(lastTransition))) {
      // condition
    } else if (isA(t, 'BlendAnimation') && inTree(kids(lastState))) {
      // blend animation
    } else if (isA(t, 'StateMachineFireAction') && inTree(kids(lastLayerComp))) {
      // fire event
    } else if (isA(t, 'StateMachineListener') && inTree(kids(lastSM))) {
      lastListener = o;
    } else if (lastListener && (isA(t, 'ListenerAction') || t.startsWith('ListenerInputType')) && inTree(kids(lastListener))) {
      // listener action
    } else if (lastSM && isA(t, 'StateMachineInput') && inTree(kids(lastSM))) {
      // input
    } else if (!lastSM && !lastAnim && isIndexable(t)) {
      ab.objects.push(o);
      idx.components.push(o);
    } else if ((lastSM || lastAnim) && lastTreeObj) {
      // Anything else inside an animation / state machine (data binding,
      // comparators, ...) stays attached to the object it followed, which
      // preserves its exact position in the stream.
      if (isIndexable(t)) idx.components.push(o);
      kids(lastTreeObj)!.push(o);
    } else {
      ab.objects.push(o);
      if (isIndexable(t)) idx.components.push(o);
    }
  }

  // Artboard stage positions aren't part of .riv files: lay them out in a row.
  let nextX = 0;
  for (const a of doc.artboards) {
    const p = a.artboard.props;
    if (typeof p.xArtboard !== 'number') {
      a.artboard.ui = { x: nextX, y: 0 };
    }
    nextX += (typeof p.width === 'number' ? p.width : 0) + 100;
  }

  // Resolve index references into ids.
  const artboardIds = doc.artboards.map((a) => a.id);
  const assetIds = assets.map((a) => a.id);
  const resolveProps = (o: CoreObj, ctx: { idx: AbIndex; states?: CoreObj[]; inputs?: CoreObj[] }) => {
    for (const [name, value] of Object.entries(o.props)) {
      if (typeof value !== 'number') continue;
      const space = refSpaceOf(o.type, name);
      if (!space) continue;
      let list: string[] | undefined;
      switch (space) {
        case 'component':
          list = ctx.idx.components.map((c) => c.id);
          break;
        case 'animation':
          list = ctx.idx.animations.map((c) => c.id);
          break;
        case 'stateMachine':
          list = ctx.idx.stateMachines.map((c) => c.id);
          break;
        case 'state':
          list = ctx.states?.map((c) => c.id);
          break;
        case 'input':
          list = ctx.inputs?.map((c) => c.id);
          break;
        case 'asset':
          list = assetIds;
          break;
        case 'artboard':
          list = artboardIds;
          break;
      }
      if (list && value >= 0 && value < list.length) o.props[name] = list[value];
      // out-of-range values stay numeric and are written back verbatim
    }
  };
  for (const a of doc.artboards) {
    const idx = abIndex.get(a)!;
    resolveProps(a.artboard, { idx });
    for (const o of a.objects) resolveProps(o, { idx });
    const walk = (o: CoreObj, ctx: { idx: AbIndex; states?: CoreObj[]; inputs?: CoreObj[] }) => {
      resolveProps(o, ctx);
      o.children?.forEach((c) => walk(c, ctx));
    };
    for (const anim of a.animations) walk(anim, { idx });
    for (const sm of a.stateMachines) {
      const inputs = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineInput'));
      resolveProps(sm, { idx });
      for (const c of sm.children ?? []) {
        if (isA(c.type, 'StateMachineLayer')) {
          const states = (c.children ?? []).filter((s) => isA(s.type, 'LayerState'));
          walk(c, { idx, states, inputs });
        } else {
          walk(c, { idx, inputs });
        }
      }
    }
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Export

function toRaw(o: CoreObj, resolve: (space: RefSpace, id: string) => number | undefined): RawObject {
  const def = tryType(o.type);
  const typeKey = def ? def.typeKey : Number(o.type.slice(1));
  const props: RawProp[] = [];
  if (def) {
    for (const [name, value] of Object.entries(o.props)) {
      if (value === undefined || value === null) continue;
      const pd = def.propsByName.get(name);
      if (!pd) continue;
      const space = REF_SPACES[`${pd.owner}.${pd.name}`];
      if (space && typeof value === 'string') {
        const index = resolve(space, value);
        if (index === undefined) {
          // a missing animation must not silently fall back to index 0
          if (space === 'animation') props.push({ key: pd.key, value: 65535 });
          continue; // other dangling references are dropped
        }
        props.push({ key: pd.key, value: index });
      } else {
        props.push({ key: pd.key, value });
      }
    }
  }
  if (o.raw) props.push(...o.raw);
  if (o.keyOrder) {
    const rank = new Map(o.keyOrder.map((k, i) => [k, i]));
    props.sort((a, b) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9));
  }
  return { typeKey, props };
}

export function exportRiv(doc: RiveDoc): Uint8Array {
  const out: RawObject[] = [];
  const artboardIndex = new Map(doc.artboards.map((a, i) => [a.id, i]));
  const assetIndex = new Map(doc.top.filter((o) => isA(o.type, 'FileAsset')).map((o, i) => [o.id, i]));
  const emitTree = (o: CoreObj, resolve: (space: RefSpace, id: string) => number | undefined) => {
    out.push(toRaw(o, resolve));
    let children = o.children ?? [];
    // keyframes must be in ascending frame order for the runtime's binary search
    if (o.type === 'KeyedProperty') {
      children = [...children].sort((a, b) => ((a.props.frame as number) ?? 0) - ((b.props.frame as number) ?? 0));
    }
    children.forEach((c) => emitTree(c, resolve));
  };
  const fileResolve = (space: RefSpace, id: string) =>
    space === 'asset' ? assetIndex.get(id) : space === 'artboard' ? artboardIndex.get(id) : undefined;

  // Every file needs a Backboard before its artboards; keep the original order otherwise.
  const top = [...doc.top];
  if (!top.some((o) => o.type === 'Backboard')) top.unshift({ id: newId(), type: 'Backboard', props: {} });
  top.forEach((o) => emitTree(o, fileResolve));

  for (const ab of doc.artboards) {
    // File order is draw order (earlier drawables render on top), so objects
    // are written exactly in the order the editor keeps them.
    const ordered = ab.objects;
    const componentIndex = new Map<string, number>([[ab.artboard.id, 0]]);
    let i = 1;
    for (const o of ordered) if (isIndexable(o.type)) componentIndex.set(o.id, i++);
    const animIndex = new Map(ab.animations.map((a, k) => [a.id, k]));
    const smIndex = new Map(ab.stateMachines.map((a, k) => [a.id, k]));
    const base = (space: RefSpace, id: string): number | undefined => {
      switch (space) {
        case 'component':
          return componentIndex.get(id);
        case 'animation':
          return animIndex.get(id);
        case 'stateMachine':
          return smIndex.get(id);
        default:
          return fileResolve(space, id);
      }
    };
    out.push(toRaw(ab.artboard, base));
    for (const o of ordered) out.push(toRaw(o, base));
    for (const anim of ab.animations) emitTree(anim, base);
    for (const sm of ab.stateMachines) {
      const inputIndex = new Map(
        (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineInput')).map((c, k) => [c.id, k]),
      );
      out.push(toRaw(sm, base));
      for (const c of sm.children ?? []) {
        let stateIndex = new Map<string, number>();
        if (isA(c.type, 'StateMachineLayer')) {
          stateIndex = new Map((c.children ?? []).filter((s) => isA(s.type, 'LayerState')).map((s, k) => [s.id, k]));
        }
        const smResolve = (space: RefSpace, id: string) =>
          space === 'input' ? inputIndex.get(id) : space === 'state' ? stateIndex.get(id) : base(space, id);
        emitTree(c, smResolve);
      }
    }
  }
  return writeRiv({ header: doc.header ?? DEFAULT_HEADER, objects: out });
}

/**
 * Deep copy that also works on immer drafts (Proxies), which structuredClone
 * rejects. Handles plain objects, arrays and Uint8Array (font / image bytes).
 */
export function deepClone<T>(v: T): T {
  if (v instanceof Uint8Array) return v.slice() as T;
  if (Array.isArray(v)) return v.map(deepClone) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = deepClone(x);
    return out as T;
  }
  return v;
}

export const cloneDoc = deepClone;
