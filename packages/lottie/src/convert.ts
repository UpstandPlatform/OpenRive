import type { ArtboardDoc, CoreObj, RiveDoc } from '@openrive/rive/document';
import { newDoc, newNode, obj, vertexFromPen } from '@openrive/rive/factory';
import { duplicateObjects, KEYFRAME_TYPE } from '@openrive/rive/ops';
import { propDef } from '@openrive/rive/schema';
import { decodeLottieJson } from './decode';

type JsonObject = Record<string, unknown>;
type ValueKind = 'number' | 'vector2' | 'color' | 'path';
type Ease = [number, number, number, number] | 'hold' | 'linear';

interface Timing {
  sourceFps: number;
  fps: number;
  inPoint: number;
  outPoint: number;
  compositionInPoint: number;
  compositionOutPoint: number;
  allowedStartTime: number;
  allowedEndTime: number;
  timeScale: number;
  timeOffset: number;
}

interface TrackKey<T = unknown> {
  time: number;
  value: T;
  ease: Ease;
}

interface Track<T = unknown> {
  initial: T;
  keys: TrackKey<T>[];
}

interface ConversionContext {
  artboard: ArtboardDoc;
  animation: CoreObj;
  timing: Timing;
  assets: Map<string, JsonObject>;
  activePrecompositions: Set<string>;
  keyframeCount: number;
  animationKeyframeCount: number;
  geometryCount: number;
  morphOperations: number;
  keyedObjects: Map<string, CoreObj>;
  keyedProperties: Map<string, CoreObj>;
  easeInterpolators: Map<string, CoreObj>;
}

interface Geometry {
  shape: CoreObj;
  painted: boolean;
}

export interface LottieConversion {
  doc: RiveDoc;
  source: 'json' | 'tgs';
}

const MAX_LAYERS = 256;
const MAX_SHAPES = 4096;
const MAX_KEYFRAMES = 20_000;
const MAX_ANIMATION_KEYFRAMES = 250_000;
const MAX_RIVE_OBJECTS = 30_000;
const MAX_NESTING = 32;
const MAX_ARTBOARD_DIMENSION = 16_384;
const MAX_DURATION_SECONDS = 600;
const MAX_MORPH_OPERATIONS = 250_000;

export function convertLottie(input: Uint8Array, fileName = 'animation.json'): LottieConversion {
  const source = fileName.toLowerCase().endsWith('.tgs') ? 'tgs' : 'json';
  const text = decodeLottieJson(input, fileName);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`${fileName} is not valid Lottie JSON: ${reason}`);
  }

  const animation = asObject(parsed, 'animation');
  const width = positiveNumber(animation.w, 'animation.w', MAX_ARTBOARD_DIMENSION);
  const height = positiveNumber(animation.h, 'animation.h', MAX_ARTBOARD_DIMENSION);
  const sourceFps = positiveNumber(animation.fr, 'animation.fr', 240);
  const inPoint = finiteNumber(animation.ip, 'animation.ip');
  const outPoint = finiteNumber(animation.op, 'animation.op');
  if (outPoint <= inPoint) fail('animation.op', 'must be greater than animation.ip');
  const durationSeconds = (outPoint - inPoint) / sourceFps;
  if (durationSeconds > MAX_DURATION_SECONDS) fail('animation.op', `duration exceeds ${MAX_DURATION_SECONDS} seconds`);

  const fps = Math.max(1, Math.min(240, Math.round(sourceFps)));
  const timing: Timing = {
    sourceFps,
    fps,
    inPoint,
    outPoint,
    compositionInPoint: inPoint,
    compositionOutPoint: outPoint,
    allowedStartTime: inPoint,
    allowedEndTime: outPoint,
    timeScale: 1,
    timeOffset: 0,
  };
  const layers = asArray(animation.layers, 'animation.layers');
  if (layers.length === 0) fail('animation.layers', 'must contain at least one layer');
  if (layers.length > MAX_LAYERS) fail('animation.layers', `supports up to ${MAX_LAYERS} layers`);

  const doc = newDoc('Lottie');
  const artboard = doc.artboards[0]!;
  artboard.artboard.props.width = width;
  artboard.artboard.props.height = height;
  const backgroundFill = artboard.objects.find((item) => item.type === 'Fill' && item.props.parentId === artboard.id);
  const background = artboard.objects.find((item) => item.type === 'SolidColor' && item.props.parentId === backgroundFill?.id);
  if (background) background.props.colorValue = 0x00000000;
  const riveAnimation = artboard.animations[0]!;
  riveAnimation.props.name = 'Lottie Animation';
  riveAnimation.props.fps = fps;
  riveAnimation.props.duration = Math.max(1, frameAt(timing, outPoint));
  riveAnimation.props.loopValue = 1;

  const assets = new Map<string, JsonObject>();
  for (const [index, rawAsset] of asArray(animation.assets ?? [], 'animation.assets').entries()) {
    const asset = asObject(rawAsset, `animation.assets[${index}]`);
    if (typeof asset.id !== 'string' || asset.id.length === 0) fail(`animation.assets[${index}].id`, 'must be a non-empty string');
    if (assets.has(asset.id)) fail(`animation.assets[${index}].id`, `duplicate asset id “${asset.id}”`);
    if (asset.layers !== undefined) asArray(asset.layers, `animation.assets[${index}].layers`);
    assets.set(asset.id, asset);
  }

  const context: ConversionContext = {
    artboard,
    animation: riveAnimation,
    timing,
    assets,
    activePrecompositions: new Set(),
    keyframeCount: 0,
    animationKeyframeCount: 0,
    geometryCount: 0,
    morphOperations: 0,
    keyedObjects: new Map(),
    keyedProperties: new Map(),
    easeInterpolators: new Map(),
  };
  const layerNodes = createLayerNodes(layers, context, artboard.id, 'animation.layers', 0);
  for (const entry of layerNodes) {
    if (entry.layer.ty === 4) {
      withTiming(context, entry.timing, () => {
        const shapes = asArray(entry.layer.shapes, `${entry.path}.shapes`);
        parseShapeItems(shapes, entry.contentParentId, `${entry.path}.shapes`, context, 0);
      });
    } else if (entry.layer.ty === 0) parseNestedPrecomposition(entry, context, 1);
  }

  if (context.geometryCount === 0) fail('animation.layers', 'contains no visible vector shapes to import');
  return { doc, source };
}

function createLayerNodes(
  layers: unknown[],
  context: ConversionContext,
  compositionParentId: string,
  pathPrefix: string,
  depth: number,
): { layer: JsonObject; contentParentId: string; path: string; timing: Timing }[] {
  if (depth > MAX_NESTING) fail(pathPrefix, `precomposition nesting exceeds ${MAX_NESTING} levels`);
  if (context.timing.allowedEndTime < context.timing.allowedStartTime - 0.001) return [];
  const sourceLayers = layers.map((raw, index) => ({ layer: asObject(raw, `animation.layers[${index}]`), path: `animation.layers[${index}]` }));
  for (const [position, source] of sourceLayers.entries()) {
    source.path = `${pathPrefix}[${position}]`;
  }
  const layerIndices = new Map<number, { layer: JsonObject; path: string; position: number }>();
  for (const [position, { layer, path }] of sourceLayers.entries()) {
    if (layer.hd === true) continue;
    const type = finiteNumber(layer.ty, `${path}.ty`);
    if (type !== 0 && type !== 3 && type !== 4) fail(`${path}.ty`, `layer type ${type} is not supported; use a vector shape, null, or precomposition layer`);
    if (type === 0 && layer.refId === undefined) fail(`${path}.refId`, 'precomposition layer is missing its asset reference');
    if (layer.ddd === 1) fail(`${path}.ddd`, '3D layers cannot be represented in a 2D Rive artboard');
    if (layer.ao === 1) fail(`${path}.ao`, 'auto-orientation is not supported');
    const startTime = optionalNumber(layer.st, 0, `${path}.st`);
    const stretch = optionalNumber(layer.sr, 1, `${path}.sr`);
    if (stretch <= 0) fail(`${path}.sr`, 'reverse or zero time stretch is not supported');
    if (layer.tt !== undefined && layer.tt !== 0) fail(`${path}.tt`, 'track mattes are not supported');
    if (layer.td !== undefined && layer.td !== 0) fail(`${path}.td`, 'track matte sources are not supported');
    if (asArray(layer.masksProperties ?? [], `${path}.masksProperties`).length > 0) fail(`${path}.masksProperties`, 'masks are not supported');
    if (asArray(layer.ef ?? [], `${path}.ef`).length > 0) fail(`${path}.ef`, 'layer effects are not supported');
    if (layer.bm !== undefined && finiteNumber(layer.bm, `${path}.bm`) !== 0) fail(`${path}.bm`, 'non-normal layer blend modes are not supported');
    const layerIn = optionalNumber(layer.ip, context.timing.compositionInPoint, `${path}.ip`);
    const layerOut = optionalNumber(layer.op, context.timing.compositionOutPoint, `${path}.op`);
    const index = optionalNumber(layer.ind, position + 1, `${path}.ind`);
    if (!Number.isInteger(index) || index < 0) fail(`${path}.ind`, 'must be a non-negative integer');
    if (layerIndices.has(index)) fail(`${path}.ind`, `duplicate layer index ${index}`);
    layerIndices.set(index, { layer, path, position });
  }

  const built = new Map<number, { layer: JsonObject; contentParentId: string; path: string; timing: Timing }>();
  const visiting = new Set<number>();
  const buildLayer = (index: number): string => {
    const existing = built.get(index);
    if (existing) return existing.contentParentId;
    const source = layerIndices.get(index);
    if (!source) fail(pathPrefix, `parent layer ${index} does not exist in this composition`);
    if (visiting.has(index)) fail(`${source.path}.parent`, 'layer parent cycle detected');
    visiting.add(index);
    const { layer, path } = source;
    let parentId = compositionParentId;
    if (layer.parent !== undefined && layer.parent !== null) {
      const parentIndex = finiteNumber(layer.parent, `${path}.parent`);
      if (!Number.isInteger(parentIndex) || parentIndex < 0) fail(`${path}.parent`, 'must be a non-negative integer layer index');
      parentId = buildLayer(parentIndex);
    }
    const layerName = stringValue(layer.nm, `Layer ${index}`);
    const wrapperId = addVisibilityNode(parentId, layerName, layer, path, context);
    const transforms = asObject(layer.ks, `${path}.ks`);
    const startTime = optionalNumber(layer.st, 0, `${path}.st`);
    const stretch = optionalNumber(layer.sr, 1, `${path}.sr`);
    const layerTiming: Timing = {
      ...context.timing,
      timeScale: context.timing.timeScale * stretch,
      timeOffset: context.timing.timeOffset + context.timing.timeScale * startTime,
    };
    const contentParentId = withTiming(context, layerTiming, () =>
      addTransformNodes(wrapperId, layerName, transforms, `${path}.ks`, context),
    );
    built.set(index, { layer, contentParentId, path, timing: layerTiming });
    visiting.delete(index);
    return contentParentId;
  }

  for (const [position, source] of sourceLayers.entries()) {
    if (source.layer.hd === true) continue;
    const index = optionalNumber(source.layer.ind, position + 1, `${source.path}.ind`);
    buildLayer(index);
  }
  return [...sourceLayers.entries()]
    .filter(([, source]) => source.layer.hd !== true)
    .map(([position, source]) => built.get(optionalNumber(source.layer.ind, position + 1, `${source.path}.ind`))!);
}

function parseNestedPrecomposition(
  entry: { layer: JsonObject; contentParentId: string; path: string; timing: Timing },
  context: ConversionContext,
  depth: number,
): void {
  const assetId = stringValue(entry.layer.refId, '');
  const asset = context.assets.get(assetId);
  if (!asset || asset.layers === undefined) fail(`${entry.path}.refId`, `precomposition asset “${assetId || '(missing)'}” was not found`);
  if (context.activePrecompositions.has(assetId)) fail(`${entry.path}.refId`, `precomposition cycle detected at asset “${assetId}”`);
  context.activePrecompositions.add(assetId);

  const previousTiming = context.timing;
  try {
    if (asset.fr !== undefined && Math.abs(finiteNumber(asset.fr, `${entry.path}.precomp(${assetId}).fr`) - context.timing.sourceFps) > 0.001) {
      fail(`${entry.path}.refId`, 'precompositions with a different frame rate are not supported');
    }
    const compositionInPoint = optionalNumber(asset.ip, 0, `${entry.path}.precomp(${assetId}).ip`);
    const compositionOutPoint = optionalNumber(asset.op, previousTiming.compositionOutPoint, `${entry.path}.precomp(${assetId}).op`);
    const mappedIn = mapTime(entry.timing, compositionInPoint);
    const mappedOut = mapTime(entry.timing, compositionOutPoint);
    context.timing = {
      ...entry.timing,
      compositionInPoint,
      compositionOutPoint,
      allowedStartTime: Math.max(previousTiming.allowedStartTime, mappedIn),
      allowedEndTime: Math.min(previousTiming.allowedEndTime, mappedOut),
    };
    const assetLayers = asArray(asset.layers, `${entry.path}.precomp(${assetId}).layers`);
    const children = createLayerNodes(assetLayers, context, entry.contentParentId, `${entry.path}.precomp(${assetId}).layers`, depth);
    for (const child of children) {
      if (child.layer.ty === 4) {
        withTiming(context, child.timing, () =>
          parseShapeItems(asArray(child.layer.shapes, `${child.path}.shapes`), child.contentParentId, `${child.path}.shapes`, context, 0),
        );
      } else if (child.layer.ty === 0) {
        parseNestedPrecomposition(child, context, depth + 1);
      }
    }
  } finally {
    context.timing = previousTiming;
    context.activePrecompositions.delete(assetId);
  }
}

function addVisibilityNode(parentId: string, name: string, layer: JsonObject, path: string, context: ConversionContext): string {
  const layerIn = optionalNumber(layer.ip, context.timing.compositionInPoint, `${path}.ip`);
  const layerOut = optionalNumber(layer.op, context.timing.compositionOutPoint, `${path}.op`);
  const startsBeforeComposition = layerIn <= context.timing.compositionInPoint;
  const endsAfterComposition = layerOut >= context.timing.compositionOutPoint;
  const visibleAtStart = startsBeforeComposition && layerOut > context.timing.compositionInPoint;
  if (visibleAtStart && endsAfterComposition) return parentId;

  const wrapper = newNode(parentId, `${name} Visibility`);
  const keys: TrackKey[] = [{ time: context.timing.compositionInPoint, value: visibleAtStart ? 1 : 0, ease: 'hold' }];
  if (layerIn > context.timing.compositionInPoint + 0.001 && layerIn < context.timing.compositionOutPoint) {
    keys.push({ time: layerIn, value: 1, ease: 'hold' });
  }
  if (!endsAfterComposition && layerOut > context.timing.compositionInPoint) {
    keys.push({ time: layerOut, value: 0, ease: 'hold' });
  }
  appendObjects(context, wrapper);
  animateKeys(context, wrapper, 'opacity', keys);
  return wrapper.id;
}

function addTransformNodes(parentId: string, name: string, source: JsonObject, path: string, context: ConversionContext): string {
  const anchor = readTrack(source.a ?? { a: 0, k: [0, 0] }, `${path}.a`, 'vector2', context, false).initial as [number, number];
  const position = readTrack(source.p ?? { a: 0, k: [0, 0] }, `${path}.p`, 'vector2', context);
  const scale = readTrack(source.s ?? { a: 0, k: [100, 100] }, `${path}.s`, 'vector2', context);
  const rotation = readTrack(source.r ?? source.rz ?? { a: 0, k: 0 }, `${path}.r`, 'number', context);
  const opacity = readTrack(source.o ?? { a: 0, k: 100 }, `${path}.o`, 'number', context);
  const p = position.initial as [number, number];
  const s = scale.initial as [number, number];
  const outer = newNode(parentId, name, p[0], p[1]);
  outer.props.rotation = degreesToRadians(rotation.initial as number);
  outer.props.scaleX = s[0] / 100;
  outer.props.scaleY = s[1] / 100;
  outer.props.opacity = (opacity.initial as number) / 100;
  validatePercent(opacity.initial as number, `${path}.o`);
  for (const key of opacity.keys) validatePercent(key.value as number, `${path}.o`);
  const offset = newNode(outer.id, `${name} Anchor`, -anchor[0], -anchor[1]);
  appendObjects(context, outer, offset);

  animateVector(context, outer, 'x', position, 0);
  animateVector(context, outer, 'y', position, 1);
  animateVector(context, outer, 'scaleX', scale, 0, (value) => value / 100);
  animateVector(context, outer, 'scaleY', scale, 1, (value) => value / 100);
  animateScalar(context, outer, 'rotation', rotation, degreesToRadians);
  animateScalar(context, outer, 'opacity', opacity, (value) => value / 100);
  return offset.id;
}

function parseShapeItems(items: unknown[], parentId: string, path: string, context: ConversionContext, depth: number): Geometry[] {
  if (depth > MAX_NESTING) fail(path, `shape nesting exceeds ${MAX_NESTING} levels`);
  const itemObjects = items.map((raw, index) => asObject(raw, `${path}[${index}]`));
  const transformItems = itemObjects.filter((item) => item.ty === 'tr');
  if (transformItems.length > 1) fail(path, 'a shape group can have only one transform');
  let childParentId = parentId;
  let sourceItems = itemObjects;
  if (transformItems.length === 1) {
    const transformIndex = itemObjects.indexOf(transformItems[0]!);
    if (transformIndex !== itemObjects.length - 1) fail(`${path}[${transformIndex}]`, 'a group transform must be the last item');
    childParentId = addTransformNodes(parentId, stringValue(transformItems[0]!.nm, 'Group'), transformItems[0]!, `${path}[${transformIndex}]`, context);
    sourceItems = itemObjects.slice(0, -1);
  }

  const geometry: Geometry[] = [];
  const paints: { style: JsonObject; path: string; type: 'fill' | 'stroke' | 'gradientFill' | 'gradientStroke' }[] = [];
  let seenPaint = false;
  for (let index = 0; index < sourceItems.length; index++) {
    const item = sourceItems[index]!;
    const itemPath = `${path}[${index}]`;
    if (item.hd === true) continue;
    switch (item.ty) {
      case 'sh':
      case 'rc':
      case 'el':
      case 'sr':
        if (seenPaint) fail(itemPath, 'shape geometry must precede its fill and stroke styles');
        geometry.push(createGeometry(item, childParentId, itemPath, context));
        break;
      case 'gr': {
        if (seenPaint) fail(itemPath, 'nested groups must precede the parent group’s fill and stroke styles');
        const nested = asArray(item.it, `${itemPath}.it`);
        geometry.push(...parseShapeItems(nested, childParentId, `${itemPath}.it`, context, depth + 1));
        break;
      }
      case 'fl':
        seenPaint = true;
        paints.push({ style: item, path: itemPath, type: 'fill' });
        break;
      case 'st':
        seenPaint = true;
        paints.push({ style: item, path: itemPath, type: 'stroke' });
        break;
      case 'gf':
        seenPaint = true;
        paints.push({ style: item, path: itemPath, type: 'gradientFill' });
        break;
      case 'gs':
        seenPaint = true;
        paints.push({ style: item, path: itemPath, type: 'gradientStroke' });
        break;
      case 'rp':
        if (seenPaint) fail(itemPath, 'repeaters must appear before their fill and stroke styles');
        geometry.push(...applyRepeater(item, itemPath, childParentId, geometry, context));
        break;
      case 'tr':
        fail(itemPath, 'unexpected transform item');
        break;
      default:
        fail(`${itemPath}.ty`, `shape operator “${String(item.ty)}” is not supported`);
    }
  }

  for (const paint of paints) {
    for (const item of geometry) {
      if (paint.type === 'fill') addFill(context, item.shape, paint.style, paint.path);
      else if (paint.type === 'stroke') addStroke(context, item.shape, paint.style, paint.path);
      else addGradient(context, item.shape, paint.style, paint.path, paint.type === 'gradientStroke');
      item.painted = true;
    }
  }
  if (depth === 0) {
    for (const item of geometry) {
      if (!item.painted) fail(path, `shape “${String(item.shape.props.name)}” has no supported fill or stroke`);
    }
  }
  return geometry;
}

function applyRepeater(item: JsonObject, path: string, parentId: string, geometry: Geometry[], context: ConversionContext): Geometry[] {
  const count = readTrack(item.c, `${path}.c`, 'number', context);
  if (count.initial as number < 0 || count.keys.some((key) => (key.value as number) < 0)) fail(`${path}.c`, 'copy count must be zero or greater');
  const maxCopies = Math.ceil(Math.max(count.initial as number, ...count.keys.map((key) => key.value as number)));
  if (maxCopies > 128) fail(`${path}.c`, 'supports up to 128 copies');
  if (optionalNumber(item.m, 1, `${path}.m`) !== 1) fail(`${path}.m`, 'backward repeater stacking is not supported yet');
  const offsetTrack = readTrack(item.o ?? { a: 0, k: 0 }, `${path}.o`, 'number', context);
  if (offsetTrack.keys.length > 0 || !Number.isInteger(offsetTrack.initial) || (offsetTrack.initial as number) < 0 || (offsetTrack.initial as number) > 128) {
    fail(`${path}.o`, 'requires a static non-negative integer offset no larger than 128');
  }
  const transform = asObject(item.tr, `${path}.tr`);
  const startOpacity = readTrack(transform.so ?? { a: 0, k: 100 }, `${path}.tr.so`, 'number', context);
  const endOpacity = readTrack(transform.eo ?? { a: 0, k: 100 }, `${path}.tr.eo`, 'number', context);
  if (startOpacity.keys.length > 0 || endOpacity.keys.length > 0) fail(`${path}.tr`, 'animated repeater opacity ranges are not supported yet');
  validatePercent(startOpacity.initial as number, `${path}.tr.so`);
  validatePercent(endOpacity.initial as number, `${path}.tr.eo`);
  const offset = offsetTrack.initial as number;
  const branches = new Map<string, { root: CoreObj; entries: Geometry[] }>();
  for (const entry of geometry) {
    const root = branchRoot(context, entry.shape.id, parentId);
    const existing = branches.get(root.id);
    if (existing) existing.entries.push(entry);
    else branches.set(root.id, { root, entries: [entry] });
  }
  if (branches.size === 0) fail(path, 'requires vector shapes before the repeater');

  const repeated: Geometry[] = [];
  for (const branch of branches.values()) {
    const originalSubtree = subtreeObjects(context, branch.root.id);
    const originalShapeIds = branch.entries.map((entry) => entry.shape.id);
    for (let copyIndex = 0; copyIndex < Math.max(1, maxCopies); copyIndex++) {
      const gate = newNode(parentId, `${stringValue(item.nm, 'Repeater')} Copy ${copyIndex + 1}`);
      appendObjects(context, gate);
      const copyOpacity = interpolateCopyOpacity(count, copyIndex, maxCopies, startOpacity.initial as number, endOpacity.initial as number);
      gate.props.opacity = copyOpacity.initial;
      if (copyOpacity.keys.length > 0) animateKeys(context, gate, 'opacity', copyOpacity.keys);

      let transformParentId = gate.id;
      const transformCount = copyIndex + offset;
      for (let step = 0; step < transformCount; step++) {
        transformParentId = addTransformNodes(transformParentId, `${stringValue(item.nm, 'Repeater')} ${copyIndex + 1} Transform ${step + 1}`, transform, `${path}.tr`, context);
      }

      let shapeIds = originalShapeIds;
      if (copyIndex === 0) {
        branch.root.props.parentId = transformParentId;
      } else {
        const clonedRootId = duplicateObjects(context.artboard, [branch.root.id])[0];
        if (!clonedRootId) fail(path, 'could not duplicate repeater content');
        const clonedSubtree = subtreeObjects(context, clonedRootId);
        const originalShapes = originalSubtree.filter((object) => object.type === 'Shape');
        const clonedShapes = clonedSubtree.filter((object) => object.type === 'Shape');
        if (originalShapes.length !== clonedShapes.length) fail(path, 'could not map duplicated repeater shapes');
        const shapeMap = new Map(originalShapes.map((object, index) => [object.id, clonedShapes[index]!.id]));
        shapeIds = originalShapeIds.map((shapeId) => {
          const cloneId = shapeMap.get(shapeId);
          const clone = cloneId ? context.artboard.objects.find((object) => object.id === cloneId) : undefined;
          if (!clone) fail(path, `could not find duplicated shape ${shapeId}`);
          return clone.id;
        });
        const clonedRoot = context.artboard.objects.find((object) => object.id === clonedRootId);
        if (!clonedRoot) fail(path, 'could not find duplicated repeater content');
        clonedRoot.props.parentId = transformParentId;
        if (context.artboard.objects.length > MAX_RIVE_OBJECTS) fail(path, `creates more than ${MAX_RIVE_OBJECTS} editable Rive objects`);
      }
      for (let index = 0; index < branch.entries.length; index++) {
        const shape = context.artboard.objects.find((object) => object.id === shapeIds[index]);
        if (!shape) fail(path, 'repeater shape was lost during duplication');
        if (copyIndex > 0 && ++context.geometryCount > MAX_SHAPES) fail(path, `supports up to ${MAX_SHAPES} vector shapes`);
        repeated.push({ shape, painted: branch.entries[index]!.painted });
      }
    }
  }
  return repeated;
}

function branchRoot(context: ConversionContext, shapeId: string, boundaryParentId: string): CoreObj {
  let current = context.artboard.objects.find((object) => object.id === shapeId);
  if (!current) fail('animation.layers', `shape ${shapeId} is missing from the artboard`);
  while (current.props.parentId !== boundaryParentId) {
    const parent = context.artboard.objects.find((object) => object.id === current!.props.parentId);
    if (!parent || parent.id === context.artboard.id) fail('animation.layers', 'repeater content escapes its shape group');
    current = parent;
  }
  return current;
}

function subtreeObjects(context: ConversionContext, rootId: string): CoreObj[] {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of context.artboard.objects) {
      if (!ids.has(object.id) && typeof object.props.parentId === 'string' && ids.has(object.props.parentId)) {
        ids.add(object.id);
        changed = true;
      }
    }
  }
  return context.artboard.objects.filter((object) => ids.has(object.id));
}

function interpolateCopyOpacity(count: Track, index: number, maxCopies: number, startPercent: number, endPercent: number): { initial: number; keys: TrackKey[] } {
  const opacityAtCount = (value: number) => Math.max(0, Math.min(1, value - index)) * (
    maxCopies <= 1 ? startPercent : startPercent + ((endPercent - startPercent) * index) / (maxCopies - 1)
  ) / 100;
  return {
    initial: opacityAtCount(count.initial as number),
    keys: count.keys.map((key) => ({ ...key, value: opacityAtCount(key.value as number) })),
  };
}

function createGeometry(item: JsonObject, parentId: string, path: string, context: ConversionContext): Geometry {
  if (++context.geometryCount > MAX_SHAPES) fail(path, `supports up to ${MAX_SHAPES} vector shapes`);
  const name = stringValue(item.nm, item.ty === 'sh' ? 'Path' : item.ty === 'rc' ? 'Rectangle' : item.ty === 'sr' ? 'Star' : 'Ellipse');
  const shape = obj('Shape', { name, parentId, x: 0, y: 0 });

  if (item.ty === 'sh') {
    const track = readTrack(item.ks, `${path}.ks`, 'path', context);
    const pathData = asObject(track.initial, `${path}.ks.k`);
    const initialVertices = pathVertices(pathData, `${path}.ks.k`);
    const frames = track.keys.length > 0 ? track.keys : [{ time: 0, value: pathData, ease: 'linear' as const }];
    const parsedFrames = frames.map((frame, index) => {
      const data = asObject(frame.value, `${path}.ks.k[${index}]`);
      const vertices = pathVertices(data, `${path}.ks.k[${index}]`);
      if (data.c !== pathData.c) fail(`${path}.ks.k[${index}].c`, 'path morphs must keep the same closed/open state');
      if (vertices.length !== initialVertices.length) fail(`${path}.ks.k[${index}].v`, 'path morphs must keep the same vertex count');
      return { ...frame, vertices };
    });
    if (track.keys.length > 0) {
      const animatedPropertyCount = initialVertices.reduce((count, _point, index) => {
        const curved = parsedFrames.some((frame) => {
          const point = frame.vertices[index]!;
          return hasNonZeroVector([point.inX, point.inY, point.outX, point.outY]);
        });
        return count + (curved ? 6 : 2);
      }, 0);
      context.morphOperations += animatedPropertyCount * track.keys.length;
      if (context.morphOperations > MAX_MORPH_OPERATIONS) {
        fail(`${path}.ks`, `path morphs exceed the ${MAX_MORPH_OPERATIONS} animated-property safety limit`);
      }
    }
    const contour = obj('PointsPath', { name: `${name} Path`, parentId: shape.id, isClosed: pathData.c === true });
    const curvedVertices = initialVertices.map((_point, index) => parsedFrames.some((frame) => {
      const point = frame.vertices[index]!;
      return hasNonZeroVector([point.inX, point.inY, point.outX, point.outY]);
    }));
    const vertices = initialVertices.map((point, index) => vertexFromPen(contour.id, curvedVertices[index] ? point : { x: point.x, y: point.y }));
    appendObjects(context, shape, contour, ...vertices);
    if (track.keys.length > 0) {
      for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex++) {
        const vertex = vertices[vertexIndex]!;
        const scalarTracks: [string, (point: (typeof initialVertices)[number]) => number][] = [
          ['x', (point) => point.x],
          ['y', (point) => point.y],
        ];
        if (curvedVertices[vertexIndex]) {
          scalarTracks.push(
            ['inRotation', (point) => Math.atan2(point.inY ?? 0, point.inX ?? 0)],
            ['inDistance', (point) => Math.hypot(point.inX ?? 0, point.inY ?? 0)],
            ['outRotation', (point) => Math.atan2(point.outY ?? 0, point.outX ?? 0)],
            ['outDistance', (point) => Math.hypot(point.outX ?? 0, point.outY ?? 0)],
          );
        }
        for (const [property, read] of scalarTracks) {
          let previousAngle: number | undefined;
          const keys = parsedFrames.map((frame) => {
            let value = read(frame.vertices[vertexIndex]!);
            if (property === 'inRotation' || property === 'outRotation') {
              if (previousAngle !== undefined) {
                while (value - previousAngle > Math.PI) value -= Math.PI * 2;
                while (value - previousAngle < -Math.PI) value += Math.PI * 2;
              }
              previousAngle = value;
            }
            return { time: frame.time, value, ease: frame.ease };
          });
          animateKeys(context, vertex, property, keys);
        }
      }
    }
    return { shape, painted: false };
  }

  if (item.ty === 'sr') {
    const starKind = enumValue(item.sy, 1, { 1: 1, 2: 2 }, `${path}.sy`);
    const points = readTrack(item.pt ?? { a: 0, k: 5 }, `${path}.pt`, 'number', context);
    const position = readTrack(item.p ?? { a: 0, k: [0, 0] }, `${path}.p`, 'vector2', context);
    const rotation = readTrack(item.r ?? { a: 0, k: 0 }, `${path}.r`, 'number', context);
    const outerRadius = readTrack(item.or ?? { a: 0, k: 0 }, `${path}.or`, 'number', context);
    const outerRoundness = readTrack(item.os ?? { a: 0, k: 0 }, `${path}.os`, 'number', context);
    const p = position.initial as [number, number];
    const pointCount = points.initial as number;
    const radius = outerRadius.initial as number;
    if (pointCount < 2 || pointCount > 128) fail(`${path}.pt`, 'must be between 2 and 128');
    if (radius < 0 || outerRadius.keys.some((key) => (key.value as number) < 0)) fail(`${path}.or`, 'must be zero or greater');
    if ((outerRoundness.initial as number) !== 0 || outerRoundness.keys.some((key) => (key.value as number) !== 0)) {
      fail(`${path}.os`, 'rounded star corners are not supported yet');
    }
    if (item.is !== undefined) {
      const innerRoundness = readTrack(item.is, `${path}.is`, 'number', context);
      if ((innerRoundness.initial as number) !== 0 || innerRoundness.keys.some((key) => (key.value as number) !== 0)) {
        fail(`${path}.is`, 'rounded star corners are not supported yet');
      }
    }
    const innerRadius = starKind === 1 ? readTrack(item.ir ?? { a: 0, k: radius / 2 }, `${path}.ir`, 'number', context) : undefined;
    if (innerRadius && ((innerRadius.initial as number) < 0 || (innerRadius.initial as number) > radius)) {
      fail(`${path}.ir`, 'must be between zero and the outer radius');
    }
    const pathObject = obj(starKind === 1 ? 'Star' : 'Polygon', {
      name: `${name} Path`,
      parentId: shape.id,
      width: radius * 2,
      height: radius * 2,
      originX: 0.5,
      originY: 0.5,
      points: Math.round(pointCount),
      ...(innerRadius ? { innerRadius: radius === 0 ? 0.5 : (innerRadius.initial as number) / radius } : {}),
    });
    shape.props.x = p[0];
    shape.props.y = p[1];
    shape.props.rotation = degreesToRadians(rotation.initial as number);
    appendObjects(context, shape, pathObject);
    animateVector(context, shape, 'x', position, 0);
    animateVector(context, shape, 'y', position, 1);
    animateScalar(context, shape, 'rotation', rotation, degreesToRadians);
    animateScalar(context, pathObject, 'width', outerRadius, (value) => value * 2);
    animateScalar(context, pathObject, 'height', outerRadius, (value) => value * 2);
    animateScalar(context, pathObject, 'points', points, Math.round);
    if (innerRadius) {
      if (innerRadius.keys.length > 0 || outerRadius.keys.length > 0) fail(path, 'animated star inner and outer radii must be stationary together');
    }
    return { shape, painted: false };
  }

  const position = readTrack(item.p ?? { a: 0, k: [0, 0] }, `${path}.p`, 'vector2', context);
  const size = readTrack(item.s ?? { a: 0, k: [0, 0] }, `${path}.s`, 'vector2', context);
  const p = position.initial as [number, number];
  const dimensions = size.initial as [number, number];
  if (dimensions.some((dimension) => dimension < 0) || size.keys.some((key) => (key.value as number[]).some((dimension) => dimension < 0))) {
    fail(`${path}.s`, 'dimensions must be zero or greater');
  }
  shape.props.x = p[0];
  shape.props.y = p[1];
  const pathType = item.ty === 'rc' ? 'Rectangle' : 'Ellipse';
  const pathProps: Record<string, unknown> = {
    name: `${name} Path`,
    parentId: shape.id,
    width: dimensions[0],
    height: dimensions[1],
    originX: 0.5,
    originY: 0.5,
  };
  const contour = obj(pathType, pathProps);
  if (item.ty === 'rc') {
    const radius = readTrack(item.r ?? { a: 0, k: 0 }, `${path}.r`, 'number', context);
    const r = radius.initial as number;
    if (r < 0 || radius.keys.some((key) => (key.value as number) < 0)) fail(`${path}.r`, 'must be zero or greater');
    Object.assign(contour.props, { linkCornerRadius: true, cornerRadiusTL: r, cornerRadiusTR: r, cornerRadiusBL: r, cornerRadiusBR: r });
    animateScalar(context, contour, 'cornerRadiusTL', radius);
    animateScalar(context, contour, 'cornerRadiusTR', radius);
    animateScalar(context, contour, 'cornerRadiusBL', radius);
    animateScalar(context, contour, 'cornerRadiusBR', radius);
  }
  appendObjects(context, shape, contour);
  animateVector(context, shape, 'x', position, 0);
  animateVector(context, shape, 'y', position, 1);
  animateVector(context, contour, 'width', size, 0);
  animateVector(context, contour, 'height', size, 1);
  return { shape, painted: false };
}

function addFill(context: ConversionContext, shape: CoreObj, style: JsonObject, path: string): void {
  if (style.r !== undefined && finiteNumber(style.r, `${path}.r`) !== 1 && finiteNumber(style.r, `${path}.r`) !== 2) {
    fail(`${path}.r`, 'unknown fill rule');
  }
  const fillRule = style.r === 2 ? 1 : 0;
  const color = readTrack(style.c ?? { a: 0, k: [1, 1, 1, 1] }, `${path}.c`, 'color', context);
  const opacity = readTrack(style.o ?? { a: 0, k: 100 }, `${path}.o`, 'number', context);
  if (color.keys.length > 0 && opacity.keys.length > 0) fail(path, 'color and opacity cannot both be animated on the same fill');
  const alpha = (opacity.initial as number) / 100;
  validatePercent(opacity.initial as number, `${path}.o`);
  for (const key of opacity.keys) validatePercent(key.value as number, `${path}.o`);
  const fill = obj('Fill', { name: stringValue(style.nm, 'Fill'), parentId: shape.id, fillRule });
  const solid = obj('SolidColor', {
    parentId: fill.id,
    colorValue: colorToArgb(color.initial as number[], alpha, `${path}.c`),
  });
  appendObjects(context, fill, solid);
  if (color.keys.length > 0) animateColor(context, solid, color, (value) => colorToArgb(value as number[], alpha, `${path}.c`));
  if (opacity.keys.length > 0) {
    animateColor(context, solid, opacity, (value) => colorToArgb(color.initial as number[], (value as number) / 100, `${path}.o`));
  }
}

function addStroke(context: ConversionContext, shape: CoreObj, style: JsonObject, path: string): void {
  const dash = asArray(style.d ?? [], `${path}.d`);
  if (dash.length > 0) fail(`${path}.d`, 'dashed strokes are not supported');
  const cap = enumValue(style.lc, 1, { 1: 0, 2: 1, 3: 2 }, `${path}.lc`);
  const join = enumValue(style.lj, 1, { 1: 0, 2: 1, 3: 2 }, `${path}.lj`);
  const color = readTrack(style.c ?? { a: 0, k: [1, 1, 1, 1] }, `${path}.c`, 'color', context);
  const opacity = readTrack(style.o ?? { a: 0, k: 100 }, `${path}.o`, 'number', context);
  if (color.keys.length > 0 && opacity.keys.length > 0) fail(path, 'color and opacity cannot both be animated on the same stroke');
  const alpha = (opacity.initial as number) / 100;
  validatePercent(opacity.initial as number, `${path}.o`);
  for (const key of opacity.keys) validatePercent(key.value as number, `${path}.o`);
  const width = readTrack(style.w, `${path}.w`, 'number', context);
  const thickness = width.initial as number;
  if (thickness < 0 || width.keys.some((key) => (key.value as number) < 0)) fail(`${path}.w`, 'must be zero or greater');
  const stroke = obj('Stroke', {
    name: stringValue(style.nm, 'Stroke'),
    parentId: shape.id,
    thickness,
    cap,
    join,
    transformAffectsStroke: true,
  });
  const solid = obj('SolidColor', { parentId: stroke.id, colorValue: colorToArgb(color.initial as number[], alpha, `${path}.c`) });
  appendObjects(context, stroke, solid);
  animateScalar(context, stroke, 'thickness', width);
  if (color.keys.length > 0) animateColor(context, solid, color, (value) => colorToArgb(value as number[], alpha, `${path}.c`));
  if (opacity.keys.length > 0) {
    animateColor(context, solid, opacity, (value) => colorToArgb(color.initial as number[], (value as number) / 100, `${path}.o`));
  }
}

function addGradient(context: ConversionContext, shape: CoreObj, style: JsonObject, path: string, isStroke: boolean): void {
  const gradientType = enumValue(style.t, 1, { 1: 1, 2: 2 }, `${path}.t`);
  const blendMode = optionalNumber(style.bm, 0, `${path}.bm`);
  if (blendMode !== 0) fail(`${path}.bm`, 'gradient blend modes are not supported');
  const gradientData = asObject(style.g, `${path}.g`);
  const stopCount = positiveNumber(gradientData.p, `${path}.g.p`, 32);
  if (!Number.isInteger(stopCount) || stopCount < 2) fail(`${path}.g.p`, 'must contain an integer stop count from 2 to 32');
  const valuesTrack = asObject(gradientData.k, `${path}.g.k`);
  if (valuesTrack.a === 1 || isKeyframeList(valuesTrack.k)) fail(`${path}.g.k`, 'animated gradient stops are not supported yet');
  if (typeof valuesTrack.x === 'string' && valuesTrack.x.trim() !== '') fail(`${path}.g.k.x`, 'Lottie expressions are not supported');
  const values = asArray(valuesTrack.k, `${path}.g.k.k`).map((value, index) => finiteNumber(value, `${path}.g.k.k[${index}]`));
  const colorValueCount = stopCount * 4;
  if (values.length < colorValueCount || (values.length - colorValueCount) % 2 !== 0) {
    fail(`${path}.g.k.k`, 'must contain RGBA color stops and optional opacity stop pairs');
  }
  const opacityStops: [number, number][] = [];
  for (let index = colorValueCount; index < values.length; index += 2) {
    const position = values[index]!;
    const opacity = values[index + 1]!;
    if (position < 0 || position > 1 || opacity < 0 || opacity > 1) {
      fail(`${path}.g.k.k[${index}]`, 'opacity stop positions and values must be between 0 and 1');
    }
    opacityStops.push([position, opacity]);
  }
  opacityStops.sort((a, b) => a[0] - b[0]);

  const start = readTrack(style.s ?? { a: 0, k: [0, 0] }, `${path}.s`, 'vector2', context);
  const end = readTrack(style.e ?? { a: 0, k: [0, 0] }, `${path}.e`, 'vector2', context);
  const opacity = readTrack(style.o ?? { a: 0, k: 100 }, `${path}.o`, 'number', context);
  const width = isStroke ? readTrack(style.w ?? { a: 0, k: 1 }, `${path}.w`, 'number', context) : undefined;
  if (width && ((width.initial as number) < 0 || width.keys.some((key) => (key.value as number) < 0))) {
    fail(`${path}.w`, 'must be zero or greater');
  }
  if (isStroke && asArray(style.d ?? [], `${path}.d`).length > 0) fail(`${path}.d`, 'dashed strokes are not supported');
  const alpha = (opacity.initial as number) / 100;
  validatePercent(opacity.initial as number, `${path}.o`);
  for (const key of opacity.keys) validatePercent(key.value as number, `${path}.o`);

  const paint = isStroke
    ? obj('Stroke', {
        name: stringValue(style.nm, 'Gradient Stroke'),
        parentId: shape.id,
        thickness: width!.initial as number,
        cap: enumValue(style.lc, 1, { 1: 0, 2: 1, 3: 2 }, `${path}.lc`),
        join: enumValue(style.lj, 1, { 1: 0, 2: 1, 3: 2 }, `${path}.lj`),
        transformAffectsStroke: true,
      })
    : obj('Fill', {
        name: stringValue(style.nm, 'Gradient Fill'),
        parentId: shape.id,
        fillRule: style.r === 2 ? 1 : 0,
      });
  const startPoint = start.initial as [number, number];
  const endPoint = end.initial as [number, number];
  const gradient = obj(gradientType === 2 ? 'RadialGradient' : 'LinearGradient', {
    parentId: paint.id,
    startX: startPoint[0],
    startY: startPoint[1],
    endX: endPoint[0],
    endY: endPoint[1],
    opacity: alpha,
  });
  const stops: CoreObj[] = [];
  for (let index = 0; index < stopCount; index++) {
    const base = index * 4;
    const position = values[base]!;
    const colorAlpha = opacityStops.length > 0 ? opacityAt(opacityStops, position) : 1;
    if (position < 0 || position > 1) fail(`${path}.g.k.k[${base}]`, 'color stop positions must be between 0 and 1');
    const color = [values[base + 1]!, values[base + 2]!, values[base + 3]!, colorAlpha];
    stops.push(obj('GradientStop', {
      name: `Gradient Stop ${index + 1}`,
      parentId: gradient.id,
      colorValue: colorToArgb(color, 1, `${path}.g.k.k[${base}]`),
      position,
    }));
  }
  appendObjects(context, paint, gradient, ...stops);
  animateVector(context, gradient, 'startX', start, 0);
  animateVector(context, gradient, 'startY', start, 1);
  animateVector(context, gradient, 'endX', end, 0);
  animateVector(context, gradient, 'endY', end, 1);
  animateScalar(context, gradient, 'opacity', opacity, (value) => value / 100);
  if (width) animateScalar(context, paint, 'thickness', width);
}

function opacityAt(stops: [number, number][], position: number): number {
  if (position <= stops[0]![0]) return stops[0]![1];
  for (let index = 1; index < stops.length; index++) {
    const current = stops[index]!;
    const previous = stops[index - 1]!;
    if (position <= current[0]) {
      const distance = current[0] - previous[0];
      if (distance === 0) return current[1];
      const amount = (position - previous[0]) / distance;
      return previous[1] + (current[1] - previous[1]) * amount;
    }
  }
  return stops.at(-1)![1];
}

function readTrack(raw: unknown, path: string, kind: ValueKind, context: ConversionContext, allowAnimated = true): Track {
  if (raw === undefined || raw === null) fail(path, 'is missing');
  const wrapper = isObject(raw) ? raw : { k: raw };
  if (typeof wrapper.x === 'string' && wrapper.x.trim() !== '') fail(`${path}.x`, 'Lottie expressions are not supported');
  if (wrapper.s === true) fail(`${path}.s`, 'separated-dimension properties are not supported');
  const keyframes = wrapper.a === 1 || isKeyframeList(wrapper.k);
  if (keyframes) {
    if (!allowAnimated) fail(path, 'must be static');
    const entries = asArray(wrapper.k, `${path}.k`).map((entry, index) => asObject(entry, `${path}.k[${index}]`));
    if (entries.length === 0) fail(`${path}.k`, 'must contain keyframes');
    const keys: TrackKey[] = [];
    let previousEnd: unknown;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      const time = finiteNumber(entry.t, `${path}.k[${index}].t`);
      if (Math.abs(time) > 1_000_000_000) fail(`${path}.k[${index}].t`, 'is outside the supported timeline range');
      const start = entry.s === undefined ? previousEnd : entry.s;
      if (start === undefined) fail(`${path}.k[${index}].s`, 'is missing its start value');
      const value = normalizeValue(start, kind, `${path}.k[${index}].s`);
      const next = entries[index + 1];
      const spatial = hasNonZeroVector(entry.to) || hasNonZeroVector(next?.ti);
      if (spatial) {
        if (kind !== 'vector2' || !path.endsWith('.p')) fail(`${path}.k[${index}]`, 'spatial tangents are supported only for 2D position tracks');
        const ease = entry.h === 1 ? 'hold' : lottieEase(entry, next, `${path}.k[${index}]`);
        keys.push({ time, value, ease: 'linear' });
        if (next && entry.h !== 1) {
          const endValue = normalizeValue(next.s ?? previousEnd, kind, `${path}.k[${index + 1}].s`) as number[];
          const outgoing = entry.to === undefined ? [0, 0] : vector(entry.to, `${path}.k[${index}].to`);
          const incoming = next.ti === undefined ? [0, 0] : vector(next.ti, `${path}.k[${index + 1}].ti`);
          const duration = finiteNumber(next.t, `${path}.k[${index + 1}].t`) - time;
          if (duration < 0) fail(`${path}.k[${index + 1}].t`, 'keyframe times must be in ascending order');
          for (let sample = Math.floor(time) + 1; sample < finiteNumber(next.t, `${path}.k[${index + 1}].t`); sample++) {
            const amount = (sample - time) / duration;
            const eased = easeProgress(amount, ease);
            const valueAtTime = [0, 1].map((component) => cubicValue(
              (value as number[])[component]!,
              (value as number[])[component]! + outgoing[component]!,
              endValue[component]! + incoming[component]!,
              endValue[component]!,
              eased,
            ));
            keys.push({ time: sample, value: valueAtTime, ease: 'linear' });
            if (++context.keyframeCount > MAX_KEYFRAMES) fail(path, `supports up to ${MAX_KEYFRAMES} keyframes`);
          }
        }
      } else {
        const ease = entry.h === 1 ? 'hold' : lottieEase(entry, next, `${path}.k[${index}]`);
        keys.push({ time, value, ease });
      }
      previousEnd = entry.e === undefined ? start : entry.e;
      if (++context.keyframeCount > MAX_KEYFRAMES) fail(path, `supports up to ${MAX_KEYFRAMES} keyframes`);
    }
    const last = entries.at(-1)!;
    const sourceEndTime = sourceTimeAtRoot(context.timing, context.timing.allowedEndTime);
    if (last.e !== undefined && sourceEndTime > keys.at(-1)!.time + 0.001) {
      keys.push({ time: sourceEndTime, value: normalizeValue(last.e, kind, `${path}.k[${entries.length - 1}].e`), ease: 'linear' });
      if (++context.keyframeCount > MAX_KEYFRAMES) fail(path, `supports up to ${MAX_KEYFRAMES} keyframes`);
    }
    keys.sort((a, b) => a.time - b.time);
    const clippedKeys = clipTrackKeys(keys, kind, context, path);
    const usableKeys = uniqueTrackKeys(clippedKeys, context, path);
    return { initial: usableKeys[0]!.value, keys: usableKeys };
  }
  const value = normalizeValue(wrapper.k ?? raw, kind, `${path}.k`);
  return { initial: value, keys: [] };
}

function uniqueTrackKeys(keys: TrackKey[], context: ConversionContext, path: string): TrackKey[] {
  const output: TrackKey[] = [];
  for (const key of keys) {
    const frame = frameAt(context.timing, key.time);
    const previous = output.at(-1);
    if (previous && frameAt(context.timing, previous.time) === frame) {
      output[output.length - 1] = key;
    } else {
      output.push(key);
    }
  }
  if (output.length === 0) fail(path, 'has no usable keyframes');
  return output;
}

function clipTrackKeys(keys: TrackKey[], kind: ValueKind, context: ConversionContext, path: string): TrackKey[] {
  const start = sourceTimeAtRoot(context.timing, context.timing.allowedStartTime);
  const end = sourceTimeAtRoot(context.timing, context.timing.allowedEndTime);
  if (keys.every((key) => key.time >= start - 0.001 && key.time <= end + 0.001)) return keys;
  const sampleCount = Math.ceil(end - start) + 1;
  if (!Number.isFinite(sampleCount) || sampleCount < 1 || sampleCount > MAX_KEYFRAMES) {
    fail(path, `clipped timeline needs more than ${MAX_KEYFRAMES} sampled keyframes`);
  }
  const output: TrackKey[] = [{ time: start, value: sampleTrackValue(keys, start, kind, path), ease: 'linear' }];
  for (let time = Math.floor(start) + 1; time < end; time++) {
    output.push({ time, value: sampleTrackValue(keys, time, kind, path), ease: 'linear' });
  }
  if (end > start + 0.001) output.push({ time: end, value: sampleTrackValue(keys, end, kind, path), ease: 'linear' });
  context.keyframeCount += output.length;
  if (context.keyframeCount > MAX_KEYFRAMES) fail(path, `supports up to ${MAX_KEYFRAMES} keyframes`);
  return output;
}

function sampleTrackValue(keys: TrackKey[], time: number, kind: ValueKind, path: string): unknown {
  const first = keys[0]!;
  if (time <= first.time) return first.value;
  for (let index = 0; index < keys.length - 1; index++) {
    const current = keys[index]!;
    const next = keys[index + 1]!;
    if (time > next.time) continue;
    if (current.ease === 'hold' || next.time <= current.time) return current.value;
    const amount = easeProgress((time - current.time) / (next.time - current.time), current.ease);
    if (kind === 'number') {
      return (current.value as number) + ((next.value as number) - (current.value as number)) * amount;
    }
    if (kind === 'vector2' || kind === 'color') {
      return (current.value as number[]).map((value, component) => value + ((next.value as number[])[component]! - value) * amount);
    }
    if (kind === 'path') return interpolatePathData(current.value, next.value, amount, path);
    fail(path, 'cannot sample this animated property type');
  }
  return keys.at(-1)!.value;
}

function interpolatePathData(leftRaw: unknown, rightRaw: unknown, amount: number, path: string): JsonObject {
  const left = asObject(leftRaw, path);
  const right = asObject(rightRaw, path);
  if (left.c !== right.c) fail(path, 'path morphs must keep the same closed/open state');
  const result: JsonObject = { ...left };
  for (const key of ['v', 'i', 'o'] as const) {
    const leftPoints = asArray(left[key], `${path}.${key}`);
    const rightPoints = asArray(right[key], `${path}.${key}`);
    if (leftPoints.length !== rightPoints.length) fail(`${path}.${key}`, 'path morphs must keep matching vertex and tangent counts');
    result[key] = leftPoints.map((rawLeft, index) => {
      const leftPoint = vector(rawLeft, `${path}.${key}[${index}]`);
      const rightPoint = vector(rightPoints[index], `${path}.${key}[${index}]`);
      return leftPoint.map((value, component) => value + (rightPoint[component]! - value) * amount);
    });
  }
  if (asArray(result.v, `${path}.v`).length !== asArray(result.i, `${path}.i`).length || asArray(result.v, `${path}.v`).length !== asArray(result.o, `${path}.o`).length) {
    fail(path, 'path morphs must keep matching vertex and tangent counts');
  }
  return result;
}

function normalizeValue(raw: unknown, kind: ValueKind, path: string): unknown {
  if (kind === 'path') return asObject(Array.isArray(raw) && raw.length === 1 ? raw[0] : raw, path);
  const value = unwrapArray(raw);
  if (kind === 'number') {
    const scalar = Array.isArray(value) ? value[0] : value;
    return finiteNumber(scalar, path);
  }
  const values = asArray(value, path);
  const expected = kind === 'vector2' ? 2 : 4;
  if (kind === 'vector2' && values.length === 3) {
    finiteNumber(values[2], `${path}[2]`); // Bodymovin commonly writes an unused z component for 2D values.
    return [finiteNumber(values[0], `${path}[0]`), finiteNumber(values[1], `${path}[1]`)];
  }
  if (values.length !== expected) fail(path, `must contain ${expected} numeric values`);
  return values.map((part, index) => finiteNumber(part, `${path}[${index}]`));
}

function pathVertices(data: JsonObject, path: string): { x: number; y: number; inX?: number; inY?: number; outX?: number; outY?: number }[] {
  const vertices = asArray(data.v, `${path}.v`);
  const incoming = asArray(data.i, `${path}.i`);
  const outgoing = asArray(data.o, `${path}.o`);
  if (vertices.length === 0 || vertices.length > 4096) fail(`${path}.v`, 'must contain between 1 and 4096 vertices');
  if (incoming.length !== vertices.length || outgoing.length !== vertices.length) fail(path, 'vertex and tangent arrays must have matching lengths');
  return vertices.map((rawVertex, index) => {
    const vertex = vector(rawVertex, `${path}.v[${index}]`);
    const inHandle = vector(incoming[index], `${path}.i[${index}]`);
    const outHandle = vector(outgoing[index], `${path}.o[${index}]`);
    return { x: vertex[0], y: vertex[1], inX: inHandle[0], inY: inHandle[1], outX: outHandle[0], outY: outHandle[1] };
  });
}

function animateVector(
  context: ConversionContext,
  target: CoreObj,
  property: string,
  track: Track,
  component: number,
  convert: (value: number) => number = (value) => value,
): void {
  if (track.keys.length === 0) return;
  animateKeys(context, target, property, track.keys.map((key) => ({ ...key, value: convert((key.value as number[])[component]!) })));
}

function animateScalar(context: ConversionContext, target: CoreObj, property: string, track: Track, convert: (value: number) => number = (value) => value): void {
  if (track.keys.length === 0) return;
  animateKeys(context, target, property, track.keys.map((key) => ({ ...key, value: convert(key.value as number) })));
}

function animateColor(context: ConversionContext, target: CoreObj, track: Track, convert: (value: unknown) => number): void {
  if (track.keys.length === 0) return;
  animateKeys(context, target, 'colorValue', track.keys.map((key) => ({ ...key, value: convert(key.value) })));
}

function animateKeys(context: ConversionContext, target: CoreObj, property: string, keys: TrackKey[]): void {
  for (const key of keys) {
    const frame = frameAt(context.timing, key.time);
    const keyframe = upsertCachedKeyframe(context, target, property, key.value, frame);
    if (!keyframe) fail(`${target.type}.${property}`, 'is not animatable in Rive');
    if (key.ease === 'hold') {
      keyframe.props.interpolationType = 0;
      delete keyframe.props.interpolatorId;
    } else if (key.ease === 'linear') {
      keyframe.props.interpolationType = 1;
      delete keyframe.props.interpolatorId;
    } else {
      const cacheKey = key.ease.join(',');
      let interpolator = context.easeInterpolators.get(cacheKey);
      if (!interpolator) {
        interpolator = obj('CubicEaseInterpolator', { x1: key.ease[0], y1: key.ease[1], x2: key.ease[2], y2: key.ease[3] });
        appendObjects(context, interpolator);
        context.easeInterpolators.set(cacheKey, interpolator);
      }
      keyframe.props.interpolationType = 2;
      keyframe.props.interpolatorId = interpolator.id;
    }
  }
}

function upsertCachedKeyframe(context: ConversionContext, target: CoreObj, property: string, value: unknown, frame: number): CoreObj | undefined {
  const definition = propDef(target.type, property);
  const keyframeType = definition ? KEYFRAME_TYPE[definition.type] : undefined;
  if (!definition || !keyframeType) return undefined;

  context.animation.children ??= [];
  let keyedObject = context.keyedObjects.get(target.id);
  if (!keyedObject) {
    keyedObject = context.animation.children.find((item) => item.type === 'KeyedObject' && item.props.objectId === target.id);
    if (!keyedObject) {
      keyedObject = obj('KeyedObject', { objectId: target.id }, []);
      context.animation.children.push(keyedObject);
    }
    context.keyedObjects.set(target.id, keyedObject);
  }

  const cacheKey = `${target.id}\u0000${definition.key}`;
  let keyedProperty = context.keyedProperties.get(cacheKey);
  if (!keyedProperty) {
    keyedObject.children ??= [];
    keyedProperty = keyedObject.children.find((item) => item.props.propertyKey === definition.key);
    if (!keyedProperty) {
      keyedProperty = obj('KeyedProperty', { propertyKey: definition.key }, []);
      keyedObject.children.push(keyedProperty);
    }
    context.keyedProperties.set(cacheKey, keyedProperty);
  }

  keyedProperty.children ??= [];
  let keyframe = keyedProperty.children.find((item) => item.props.frame === frame);
  if (!keyframe) {
    if (++context.animationKeyframeCount > MAX_ANIMATION_KEYFRAMES) {
      fail('animation.layers', `creates more than ${MAX_ANIMATION_KEYFRAMES} animated keyframes`);
    }
    const previous = [...keyedProperty.children]
      .filter((item) => typeof item.props.frame === 'number' && item.props.frame < frame)
      .sort((a, b) => Number(b.props.frame) - Number(a.props.frame))[0];
    keyframe = obj(keyframeType, {
      frame,
      interpolationType: previous ? previous.props.interpolationType : 1,
      ...(previous && typeof previous.props.interpolatorId === 'string' ? { interpolatorId: previous.props.interpolatorId } : {}),
    });
    keyedProperty.children.push(keyframe);
    keyedProperty.children.sort((a, b) => Number(a.props.frame) - Number(b.props.frame));
  }
  keyframe.props.value = value;
  return keyframe;
}

function appendObjects(context: ConversionContext, ...objects: CoreObj[]): void {
  if (context.artboard.objects.length + objects.length > MAX_RIVE_OBJECTS) {
    fail('animation.layers', `creates more than ${MAX_RIVE_OBJECTS} editable Rive objects`);
  }
  context.artboard.objects.push(...objects);
}

function lottieEase(current: JsonObject, next: JsonObject | undefined, path: string): Ease {
  if (!next || !isObject(current.o) || !isObject(next.i)) return 'linear';
  const out = current.o;
  const input = next.i;
  const values: [number, number, number, number] = [
    handleNumber(out.x, `${path}.o.x`),
    handleNumber(out.y, `${path}.o.y`),
    handleNumber(input.x, `${path}.i.x`),
    handleNumber(input.y, `${path}.i.y`),
  ];
  if (values[0] < 0 || values[0] > 1 || values[2] < 0 || values[2] > 1) fail(path, 'easing x handles must be in the 0..1 range');
  return values;
}

function handleNumber(raw: unknown, path: string): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return finiteNumber(value, path);
}

function hasNonZeroVector(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number') return value !== 0;
  if (Array.isArray(value)) return value.some(hasNonZeroVector);
  return true;
}

function easeProgress(amount: number, ease: Ease): number {
  if (ease === 'hold') return 0;
  if (ease === 'linear') return amount;
  const [x1, y1, x2, y2] = ease;
  const bezier = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 20; iteration++) {
    const middle = (low + high) / 2;
    if (bezier(middle, x1, x2) < amount) low = middle;
    else high = middle;
  }
  return bezier((low + high) / 2, y1, y2);
}

function cubicValue(start: number, control1: number, control2: number, end: number, amount: number): number {
  const inverse = 1 - amount;
  return inverse ** 3 * start + 3 * inverse ** 2 * amount * control1 + 3 * inverse * amount ** 2 * control2 + amount ** 3 * end;
}

function colorToArgb(value: number[], alpha: number, path: string): number {
  const channels = value.map((channel, index) => {
    if (channel < 0 || channel > 1) fail(`${path}[${index}]`, 'color channels must be between 0 and 1');
    return Math.round(channel * 255);
  });
  if (alpha < 0 || alpha > 1) fail(path, 'opacity must be between 0 and 100 percent');
  return (((Math.round(channels[3]! * alpha) & 255) << 24) | ((channels[0]! & 255) << 16) | ((channels[1]! & 255) << 8) | (channels[2]! & 255)) >>> 0;
}

function validatePercent(value: number, path: string): void {
  if (value < 0 || value > 100) fail(path, 'opacity must be between 0 and 100 percent');
}

function enumValue(raw: unknown, fallback: number, mapping: Record<number, number>, path: string): number {
  const value = raw === undefined ? fallback : finiteNumber(raw, path);
  const mapped = mapping[value];
  if (mapped === undefined) fail(path, `unsupported value ${value}`);
  return mapped;
}

function frameAt(timing: Timing, time: number): number {
  return Math.max(0, Math.round(((mapTime(timing, time) - timing.inPoint) / timing.sourceFps) * timing.fps));
}

function mapTime(timing: Timing, time: number): number {
  return timing.timeOffset + timing.timeScale * time;
}

function sourceTimeAtRoot(timing: Timing, rootTime: number): number {
  return (rootTime - timing.timeOffset) / timing.timeScale;
}

function withTiming<T>(context: ConversionContext, timing: Timing, action: () => T): T {
  const previous = context.timing;
  context.timing = timing;
  try {
    return action();
  } finally {
    context.timing = previous;
  }
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function vector(raw: unknown, path: string): [number, number] {
  const values = asArray(unwrapArray(raw), path);
  if (values.length === 3) {
    const z = finiteNumber(values[2], `${path}[2]`);
    if (z !== 0) fail(`${path}[2]`, 'nonzero z components are not supported in a 2D composition');
    return [finiteNumber(values[0], `${path}[0]`), finiteNumber(values[1], `${path}[1]`)];
  }
  if (values.length !== 2) fail(path, 'must contain two numeric values');
  return [finiteNumber(values[0], `${path}[0]`), finiteNumber(values[1], `${path}[1]`)];
}

function unwrapArray(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 && Array.isArray(value[0]) ? value[0] : value;
}

function isKeyframeList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => isObject(entry) && 't' in entry);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, path: string): JsonObject {
  if (!isObject(value)) fail(path, 'must be an object');
  return value;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(number)) fail(path, 'must be a finite number');
  return number;
}

function optionalNumber(value: unknown, fallback: number, path: string): number {
  return value === undefined || value === null ? fallback : finiteNumber(value, path);
}

function positiveNumber(value: unknown, path: string, max: number): number {
  const number = finiteNumber(value, path);
  if (number <= 0 || number > max) fail(path, `must be greater than 0 and no larger than ${max}`);
  return number;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function fail(path: string, message: string): never {
  throw new Error(`Unsupported Lottie feature at ${path}: ${message}`);
}
