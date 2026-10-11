import { strict as assert } from 'node:assert';
import { addBone } from '@openrive/rive/api';
import { newDoc } from '@openrive/rive/factory';
import { apply, buildScene, prop } from '@openrive/rive/scene';
import { boneCreationFromDrag, boneDragFrame, boneParentPoint, boneRootPositionFromPointer, boneRotationFromPointer, boneTipProps, hitBone } from '../apps/web/src/components/editor/boneEditing';

const close = (actual: number, expected: number, message: string) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, received ${actual}`);
const doc = newDoc('Bone editor scenarios');
const ab = doc.artboards[0]!;
const root = addBone(doc, { artboard: ab.id, name: 'Root', x: 30, y: 40, length: 80 });
const child = addBone(doc, { artboard: ab.id, parent: root.id, name: 'Child', length: 35, rotation: Math.PI / 2 });
const grandchild = addBone(doc, { artboard: ab.id, parent: child.id, name: 'Grandchild', length: 10 });
let scene = buildScene(ab);

// 1. Root position is reflected in the shared editor scene.
assert.deepEqual(apply(scene.nodes.get(root.id)!.world, 0, 0), [30, 40]);
// 2. A child starts at its parent's tip.
assert.deepEqual(apply(scene.nodes.get(child.id)!.world, 0, 0), [110, 40]);
// 3. A grandchild stays linked through a rotated parent.
const grandchildBase = apply(scene.nodes.get(grandchild.id)!.world, 0, 0);
close(grandchildBase[0], 110, 'grandchild base x');
close(grandchildBase[1], 75, 'grandchild base y');
// 4. Child offsets follow an animated/transient parent length override.
scene = buildScene(ab, new Map([[root.id, { length: 120 }]]));
assert.deepEqual(apply(scene.nodes.get(child.id)!.world, 0, 0), [150, 40]);
scene = buildScene(ab);

// 5. Selecting the root pivot returns its position handle.
const offset = { x: 300, y: 100 };
const zoom = 2;
const pan = { x: 90, y: 45 };
const toScreen = (x: number, y: number): [number, number] => [pan.x + x * zoom, pan.y + y * zoom];
const rootBase = apply(scene.nodes.get(root.id)!.world, 0, 0);
const rootBaseScreen = toScreen(rootBase[0] + offset.x, rootBase[1] + offset.y);
assert.deepEqual(hitBone(ab, scene, ...rootBaseScreen, offset, toScreen, root.id), { id: root.id, handle: 'base' });
// 6. A root tip is independently selectable at non-unit zoom.
const rootTip = apply(scene.nodes.get(root.id)!.world, prop(root, 'length'), 0);
const rootTipScreen = toScreen(rootTip[0] + offset.x, rootTip[1] + offset.y);
assert.deepEqual(hitBone(ab, scene, ...rootTipScreen, offset, toScreen), { id: root.id, handle: 'tip' });
// 7. The closest point on a bone shaft selects the correct bone.
const childBase = apply(scene.nodes.get(child.id)!.world, 0, 0);
const childTip = apply(scene.nodes.get(child.id)!.world, prop(child, 'length'), 0);
const childMid = [(childBase[0] + childTip[0]) / 2, (childBase[1] + childTip[1]) / 2] as const;
assert.deepEqual(hitBone(ab, scene, ...toScreen(childMid[0] + offset.x, childMid[1] + offset.y), offset, toScreen), { id: child.id, handle: 'shaft' });
// 8. An overlapping tip favors the selected bone, so crowded rigs remain editable.
const overlapping = addBone(doc, { artboard: ab.id, name: 'Overlap', x: 30, y: 40, length: 80 });
scene = buildScene(ab);
assert.deepEqual(hitBone(ab, scene, ...rootTipScreen, offset, toScreen, root.id), { id: root.id, handle: 'tip' });
// 9. Root pivot dragging maps from stage through the artboard parent transform.
const rootFrame = boneDragFrame(scene, root);
const desiredRoot = [70, 90] as const;
const desiredRootStage = [offset.x + desiredRoot[0], offset.y + desiredRoot[1]] as const;
assert.deepEqual(boneRootPositionFromPointer(rootFrame, ...desiredRootStage, offset), desiredRoot);
// 10. Root tip dragging uses the root origin, changing angle and length together.
const rootTipProps = boneTipProps(rootFrame, offset.x + 30, offset.y + 130, offset, prop(root, 'rotation'));
close(rootTipProps.length, 90, 'root tip drag length');
close(rootTipProps.rotation, Math.PI / 2, 'root tip drag rotation');
// 11. Dragging a child tip measures from the parent's endpoint, not its origin.
const childFrame = boneDragFrame(scene, child);
const movedChildTip = boneTipProps(childFrame, offset.x + 110, offset.y + 90, offset, prop(child, 'rotation'));
close(movedChildTip.length, 50, 'child tip drag length');
close(movedChildTip.rotation, Math.PI / 2, 'child tip drag rotation');
// 12. Child shaft rotation is evaluated in parent-local coordinates.
const beforeRotation = boneParentPoint(childFrame, offset.x + 140, offset.y + 40, offset);
const initialAngle = Math.atan2(beforeRotation[1] - childFrame.baseY, beforeRotation[0] - childFrame.baseX);
const rotated = boneRotationFromPointer(childFrame, offset.x + 110, offset.y + 70, offset, initialAngle, prop(child, 'rotation'));
close(rotated, Math.PI, 'child shaft rotation');
// 13. A zero-distance tip drag stays finite and preserves the current direction.
const collapsed = boneTipProps(rootFrame, offset.x + 30, offset.y + 40, offset, 0.75);
close(collapsed.length, 0.01, 'minimum bone length');
close(collapsed.rotation, 0.75, 'collapsed tip preserves angle');

// 14. Root creation converts stage coordinates into artboard-local coordinates.
ab.artboard.props.originX = 0.5;
ab.artboard.props.originY = 0.25;
scene = buildScene(ab);
const artboardOffset = { x: 500, y: 200 };
const artboardOrigin = scene.nodes.get(ab.artboard.id)!.world;
const creationStart = apply(artboardOrigin, 24, 36);
const creationEnd = apply(artboardOrigin, 24, 96);
const rootCreation = boneCreationFromDrag(ab, scene, undefined, artboardOffset.x + creationStart[0], artboardOffset.y + creationStart[1], artboardOffset.x + creationEnd[0], artboardOffset.y + creationEnd[1], artboardOffset);
close(rootCreation.x, 24, 'created root x');
close(rootCreation.y, 36, 'created root y');
close(rootCreation.length, 60, 'created root length');
close(rootCreation.rotation, Math.PI / 2, 'created root rotation');

// 15. Child creation derives its local direction under rotated, non-uniform parent transforms.
root.props.rotation = 0.4;
root.props.scaleX = 2;
root.props.scaleY = 0.5;
scene = buildScene(ab);
const parentWorld = scene.nodes.get(root.id)!.world;
const childCreateStart = apply(parentWorld, prop(root, 'length'), 0);
const childCreateEnd = apply(parentWorld, prop(root, 'length') + 25, 10);
const childCreation = boneCreationFromDrag(ab, scene, root.id, artboardOffset.x + childCreateStart[0], artboardOffset.y + childCreateStart[1], artboardOffset.x + childCreateEnd[0], artboardOffset.y + childCreateEnd[1], artboardOffset);
close(childCreation.length, Math.hypot(25, 10), 'created child length');
close(childCreation.rotation, Math.atan2(10, 25), 'created child local rotation');

// 16. Creation rejects an unknown parent instead of producing a detached bone.
assert.throws(() => boneCreationFromDrag(ab, scene, 'missing-parent', 0, 0, 20, 0, artboardOffset), /missing from the scene/);
// 17. Shaft rotation stays smooth when the pointer crosses the -π/π boundary.
const wrapFrame = { parentInverse: [1, 0, 0, 1, 0, 0] as const, baseX: 0, baseY: 0 };
const wrapTarget = -Math.PI + 0.01;
const wrapRotation = boneRotationFromPointer(wrapFrame, Math.cos(wrapTarget), Math.sin(wrapTarget), { x: 0, y: 0 }, Math.PI - 0.01, 0);
close(wrapRotation, 0.02, 'shaft rotation wraps through the shortest angle');
assert.ok(overlapping.id, 'overlapping rig fixture is retained for deterministic hit-priority checks');
console.log('✓ 17 bone editor scenarios: hierarchy transforms, canvas hit-testing, positioning, rotation, tip edits, creation, and edge cases');
