import { ArtboardDoc, CoreObj } from '@openrive/rive/document';
import { isA } from '@openrive/rive/schema';
import { apply, invert, isHidden, isLocked, Mat, prop, Scene } from '@openrive/rive/scene';

export type BoneHandle = 'base' | 'tip' | 'shaft';
export type BoneHit = { id: string; handle: BoneHandle };
export type BoneDragFrame = { parentInverse: Mat; baseX: number; baseY: number; scaleX?: number; offsetX?: number; offsetY?: number };

export function boneDragFrame(scene: Scene, bone: CoreObj): BoneDragFrame {
  const node = scene.nodes.get(bone.id);
  if (!node) throw new Error(`Bone ${bone.id} is missing from the scene.`);
  const parent = node.parent ? scene.nodes.get(node.parent) : undefined;
  const parentBone = parent?.obj;
  return {
    parentInverse: invert(parent?.world ?? [1, 0, 0, 1, 0, 0]),
    baseX: bone.type === 'RootBone' ? prop(bone, 'x', scene.overrides) : parentBone ? prop(parentBone, 'length', scene.overrides) : 0,
    baseY: bone.type === 'RootBone' ? prop(bone, 'y', scene.overrides) : 0,
    scaleX: prop(bone, 'scaleX', scene.overrides),
  };
}

export function boneParentPoint(frame: BoneDragFrame, stageX: number, stageY: number, artboardOffset: { x: number; y: number }) {
  return apply(frame.parentInverse, stageX - artboardOffset.x, stageY - artboardOffset.y);
}

export function boneTipProps(
  frame: BoneDragFrame,
  stageX: number,
  stageY: number,
  artboardOffset: { x: number; y: number },
  currentRotation: number,
) {
  const [x, y] = boneParentPoint(frame, stageX, stageY, artboardOffset);
  const scale = frame.scaleX || 1;
  const dx = (x + (frame.offsetX ?? 0) - frame.baseX) / scale;
  const dy = (y + (frame.offsetY ?? 0) - frame.baseY) / scale;
  const length = Math.hypot(dx, dy);
  return { length: Math.max(0.01, length), rotation: length < 0.01 ? currentRotation : Math.atan2(dy, dx) };
}

export function boneRotationFromPointer(
  frame: BoneDragFrame,
  stageX: number,
  stageY: number,
  artboardOffset: { x: number; y: number },
  pointerAngle: number,
  initialRotation: number,
) {
  const [x, y] = boneParentPoint(frame, stageX, stageY, artboardOffset);
  const angle = Math.atan2(y - frame.baseY, x - frame.baseX);
  const turn = angle - pointerAngle;
  const shortestTurn = Math.atan2(Math.sin(turn), Math.cos(turn));
  return initialRotation + shortestTurn;
}

export function boneRootPositionFromPointer(
  frame: BoneDragFrame,
  stageX: number,
  stageY: number,
  artboardOffset: { x: number; y: number },
) {
  const [x, y] = boneParentPoint(frame, stageX, stageY, artboardOffset);
  return [x + (frame.offsetX ?? 0), y + (frame.offsetY ?? 0)] as [number, number];
}

export function boneCreationFromDrag(
  ab: ArtboardDoc,
  scene: Scene,
  parentId: string | undefined,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  artboardOffset: { x: number; y: number },
) {
  const parent = scene.nodes.get(parentId ?? ab.artboard.id);
  if (!parent) throw new Error(`Bone parent ${parentId ?? ab.artboard.id} is missing from the scene.`);
  const parentInverse = invert(parent.world);
  const [x, y] = apply(parentInverse, startX - artboardOffset.x, startY - artboardOffset.y);
  const [tipX, tipY] = apply(parentInverse, endX - artboardOffset.x, endY - artboardOffset.y);
  const dx = tipX - x;
  const dy = tipY - y;
  return { x, y, length: Math.hypot(dx, dy), rotation: Math.atan2(dy, dx) };
}

/** Resolves whether a bone drag starts a root on the artboard or a child at a bone tip. */
export function boneCreationStart(
  ab: ArtboardDoc,
  scene: Scene,
  stageX: number,
  stageY: number,
  screenX: number,
  screenY: number,
  artboardOffset: { x: number; y: number },
  toScreen: (x: number, y: number) => [number, number],
  selectedBoneId?: string,
) {
  const selectedHit = selectedBoneId
    ? hitBone(ab, scene, screenX, screenY, artboardOffset, toScreen, selectedBoneId)
    : null;
  const tipHit = selectedHit?.handle === 'tip'
    ? selectedHit
    : hitBone(ab, scene, screenX, screenY, artboardOffset, toScreen);
  if (tipHit?.handle === 'tip') {
    const parentBone = ab.objects.find((object) => object.id === tipHit.id && isA(object.type, 'Bone'));
    const node = parentBone && scene.nodes.get(parentBone.id);
    if (parentBone && node) {
      const [tipX, tipY] = apply(node.world, prop(parentBone, 'length', scene.overrides), 0);
      return { parentId: parentBone.id, x: tipX + artboardOffset.x, y: tipY + artboardOffset.y };
    }
  }

  const x = stageX - artboardOffset.x;
  const y = stageY - artboardOffset.y;
  if (x < 0 || y < 0 || x > prop(ab.artboard, 'width') || y > prop(ab.artboard, 'height')) return null;
  return { x: stageX, y: stageY };
}

export function hitBone(
  ab: ArtboardDoc,
  scene: Scene,
  screenX: number,
  screenY: number,
  artboardOffset: { x: number; y: number },
  toScreen: (x: number, y: number) => [number, number],
  selectedId?: string,
): BoneHit | null {
  const bones = ab.objects.filter((object) => isA(object.type, 'Bone') && !isHidden(scene, object.id) && !isLocked(scene, object.id));
  const endpoints = bones.flatMap((bone) => {
    const node = scene.nodes.get(bone.id);
    if (!node) return [];
    const [baseX, baseY] = apply(node.world, 0, 0);
    const [tipX, tipY] = apply(node.world, prop(bone, 'length', scene.overrides), 0);
    return [{
      id: bone.id,
      root: bone.type === 'RootBone',
      base: toScreen(baseX + artboardOffset.x, baseY + artboardOffset.y),
      tip: toScreen(tipX + artboardOffset.x, tipY + artboardOffset.y),
    }];
  });

  const selectedTip = endpoints.find((endpoint) => endpoint.id === selectedId);
  if (selectedTip && distance(screenX, screenY, selectedTip.tip) <= 10) return { id: selectedTip.id, handle: 'tip' };
  const selectedBase = endpoints.find((endpoint) => endpoint.id === selectedId && endpoint.root);
  if (selectedBase && distance(screenX, screenY, selectedBase.base) <= 10) return { id: selectedBase.id, handle: 'base' };
  for (const endpoint of [...endpoints].reverse()) {
    if (distance(screenX, screenY, endpoint.tip) <= 10) return { id: endpoint.id, handle: 'tip' };
  }
  for (const endpoint of [...endpoints].reverse()) {
    if (endpoint.root && distance(screenX, screenY, endpoint.base) <= 10) return { id: endpoint.id, handle: 'base' };
  }

  let closest: { id: string; distance: number } | null = null;
  for (const endpoint of [...endpoints].reverse()) {
    const dx = endpoint.tip[0] - endpoint.base[0];
    const dy = endpoint.tip[1] - endpoint.base[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((screenX - endpoint.base[0]) * dx + (screenY - endpoint.base[1]) * dy) / lengthSquared)) : 0;
    const d = Math.hypot(screenX - endpoint.base[0] - t * dx, screenY - endpoint.base[1] - t * dy);
    if (d <= 8 && (!closest || d < closest.distance)) closest = { id: endpoint.id, distance: d };
  }
  return closest ? { id: closest.id, handle: 'shaft' } : null;
}

function distance(x: number, y: number, point: [number, number]) {
  return Math.hypot(x - point[0], y - point[1]);
}
