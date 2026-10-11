import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { addBone, addPath, addSkin, autoWeightSkin, convertVertexType, paintSkinWeights, rebindSkin, setBoneParent, setSkinWeights, smoothSkinWeights, unbindSkin } from '@openrive/rive/api';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { newDoc, obj } from '@openrive/rive/factory';
import { addImageAsset, placeImage } from '@openrive/rive/assets';
import { diagnoseDocument } from '@openrive/rive/diagnostics';
import { childrenOf, deleteObjects, upsertKeyframe } from '@openrive/rive/ops';
import { apply, buildScene, pathGeometry, prop, vertexControls, vertexWorldMatrix } from '@openrive/rive/scene';
import { adjustInfluence, packInfluences, unpackInfluences } from '@openrive/rive/weights';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const doc = newDoc('Rigging test');
const guarded = newDoc('Atomic rigging edits');
const guardedAb = guarded.artboards[0]!;
const guardedParent = addBone(guarded, { x: 20, y: 30, length: 60 });
const guardedRoot = addBone(guarded, { x: 40, y: 50, rotation: Math.PI / 4, length: 40 });
guardedParent.props.scaleX = 2;
let guardSnapshot = exportRiv(guarded);
assert.throws(() => setBoneParent(guarded, { bone: guardedRoot.id, parent: guardedParent.id }), /shear/);
assert.deepEqual(exportRiv(guarded), guardSnapshot, 'unsupported shear cannot partially reparent a bone');
guardedParent.props.scaleX = 1;
const guardedAnimation = obj('LinearAnimation', { name: 'Root motion', fps: 60, duration: 60 }, []);
guardedAb.animations.push(guardedAnimation);
upsertKeyframe(guardedAnimation, guardedRoot, 'x', 80, 30);
guardSnapshot = exportRiv(guarded);
assert.throws(() => setBoneParent(guarded, { bone: guardedRoot.id, parent: guardedParent.id }), /position keyframes/);
assert.deepEqual(exportRiv(guarded), guardSnapshot, 'linking cannot discard animated root position');
guardedAb.animations = [];
const guardedShape = addPath(guarded, { x: 20, y: 30, points: [{ x: 0, y: 0 }, { x: 40, y: 10 }] });
const guardedPath = childrenOf(guardedAb, guardedShape.id).find((object) => object.type === 'PointsPath')!;
const guardedSkin = addSkin(guarded, { path: guardedPath.id, bones: [guardedParent.id] });
const guardedVertex = childrenOf(guardedAb, guardedPath.id).find((object) => object.type === 'StraightVertex')!;
guardedAb.objects = guardedAb.objects.filter((object) => object.props.parentId !== guardedVertex.id);
childrenOf(guardedAb, guardedSkin.id)[0]!.props.boneId = 'missing-bone';
guardSnapshot = exportRiv(guarded);
assert.throws(() => autoWeightSkin(guarded, { path: guardedPath.id }), /existing bones/);
assert.deepEqual(exportRiv(guarded), guardSnapshot, 'invalid auto weighting does not insert partial vertex weights');
const ab = doc.artboards[0]!;
const root = addBone(doc, { artboard: ab.id, name: 'Root', x: 30, y: 40, length: 80 });
const child = addBone(doc, { artboard: ab.id, parent: root.id, name: 'Child', length: 35, rotation: Math.PI / 4 });
const vectorShape = addPath(doc, {
  artboard: ab.id,
  name: 'Skin path',
  x: 30,
  y: 40,
  points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 20 }, { x: 0, y: 20 }],
  closed: true,
});
const pointsPath = childrenOf(ab, vectorShape.id).find((o) => o.type === 'PointsPath')!;
assert.throws(() => addSkin(doc, { artboard: ab.id, path: pointsPath.id, bones: [root.id, root.id] }), /each bone only once/);
assert.throws(() => addSkin(doc, { artboard: ab.id, path: pointsPath.id, bones: Array.from({ length: 256 }, (_, i) => `bone-${i}`) }), /more than 255 bones/);
const skin = addSkin(doc, { artboard: ab.id, path: childrenOf(ab, vectorShape.id).find((o) => o.type === 'PointsPath')!.id, bones: [root.id, child.id] });
assert.equal(root.type, 'RootBone');
assert.equal(child.type, 'Bone');
assert.equal(child.props.parentId, root.id);
assert.equal(childrenOf(ab, pointsPath.id).filter((o) => o.type === 'Skin').length, 1);
assert.equal(childrenOf(ab, skin.id).filter((o) => o.type === 'Tendon').length, 2);
assert.equal(childrenOf(ab, skin.id).filter((o) => o.type === 'Tendon')[1]!.props.boneId, child.id);
const vertices = childrenOf(ab, pointsPath.id).filter((o) => o.type.endsWith('Vertex'));
assert.equal(vertices.length, 4);
assert.ok(vertices.every((vertex) => childrenOf(ab, vertex.id).some((weight) => weight.type === 'Weight')));
const convertedVertex = vertices[0]!;
const convertedWeight = childrenOf(ab, convertedVertex.id)[0]!;
convertVertexType(doc, { artboard: ab.id, vertex: convertedVertex.id, type: 'CubicAsymmetricVertex' });
assert.equal(convertedVertex.type, 'CubicAsymmetricVertex');
assert.equal(convertedWeight.type, 'CubicWeight');
assert.equal(convertedWeight.props.inValues, convertedWeight.props.values, 'converting to cubic keeps the vertex weights on both handles');
assert.equal(convertedWeight.props.outIndices, convertedWeight.props.indices, 'converting to cubic keeps the tendon indices on both handles');
convertVertexType(doc, { artboard: ab.id, vertex: convertedVertex.id, type: 'StraightVertex' });
assert.equal(convertedWeight.type, 'Weight');
assert.equal('inValues' in convertedWeight.props, false, 'converting back removes cubic-only weight data');
assert.throws(() => addBone(doc, { artboard: ab.id, parent: vectorShape.id, length: 20 }), /parented to another bone/);
assert.throws(() => addBone(doc, { artboard: ab.id, x: Number.NaN, length: 20 }), /coordinates must be finite/);

const bytes = exportRiv(doc);
assert.deepEqual(exportRiv(importRiv(bytes)), bytes, 'a newly skinned project must round-trip byte-for-byte');
const scratch = mkdtempSync(path.join(tmpdir(), 'openrive-rigging-'));
try {
  const source = path.join(scratch, 'rigged.riv');
  const rendered = path.join(scratch, 'rigged.png');
  writeFileSync(source, bytes);
  const cli = spawnSync(process.execPath, ['apps/cli/src/index.ts', 'render', source, rendered], {
    cwd: path.resolve(import.meta.dir, '..'),
    encoding: 'utf8',
    env: { ...process.env, OPENRIVE_DATA_DIR: path.join(scratch, 'data') },
  });
  assert.equal(cli.status, 0, `the CLI runtime should render the skinned file: ${cli.stderr || cli.stdout}`);
  assert.deepEqual(readFileSync(rendered).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  const close = (actual: number[], expected: number[], message: string) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]!) < 1e-5, `${message}: ${actual} != ${expected}`));
  const fixture = newDoc('Runtime skin parity');
  const artboard = fixture.artboards[0]!;
  const bone = addBone(fixture, { x: 100, y: 100, length: 80 });
  const shape = addPath(fixture, { name: 'Ribbon', x: 100, y: 100, points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 20 }, { x: 0, y: 20 }], closed: true, fill: '#ff3355' });
  const contour = childrenOf(artboard, shape.id).find((object) => object.type === 'PointsPath')!;
  const points = childrenOf(artboard, contour.id).filter((object) => object.type === 'StraightVertex');
  const renderFixture = async (label: string) => {
    const input = path.join(scratch, `${label}.riv`), output = path.join(scratch, `${label}.png`);
    writeFileSync(input, exportRiv(fixture));
    const result = spawnSync(process.execPath, ['apps/cli/src/index.ts', 'render', input, output], { cwd: path.resolve(import.meta.dir, '..'), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const image = await loadImage(readFileSync(output)), canvas = createCanvas(500, 500), context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
  };
  const originalPixel = (await renderFixture('unbound'))(140, 110);
  assert.deepEqual(originalPixel, [255, 51, 85, 255], 'runtime renders the authored contour');
  addSkin(fixture, { path: contour.id, bones: [bone.id] });
  assert.deepEqual((await renderFixture('bound'))(140, 110), originalPixel, 'binding preserves the actual rendered bind pose');
  bone.props.x = 200; bone.props.rotation = Math.PI / 2;
  const posed = await renderFixture('posed');
  assert.deepEqual(posed(190, 140), originalPixel, 'official runtime rotates/translates the skinned contour around its captured joint');
  assert.notDeepEqual(posed(140, 110), originalPixel, 'runtime leaves the original position');
  close(apply(vertexWorldMatrix(buildScene(artboard), points[2]!), 80, 20), [180, 180], 'overlay matches runtime-deformed point');
  bone.props.scaleX = 1.5; bone.props.scaleY = 0.5;
  assert.deepEqual((await renderFixture('scaled'))(195, 160), originalPixel, 'runtime supports nonuniform bone scale');
  close(apply(vertexWorldMatrix(buildScene(artboard), points[2]!), 80, 20), [190, 220], 'scaled overlay matches runtime');
  bone.props.scaleX = -1; bone.props.scaleY = 1;
  assert.deepEqual((await renderFixture('mirrored'))(190, 60), originalPixel, 'runtime supports mirrored bones');
  close(apply(vertexWorldMatrix(buildScene(artboard), points[2]!), 80, 20), [180, 20], 'mirrored overlay matches runtime');
  bone.props.scaleX = 0;
  const invalidRebind = exportRiv(fixture);
  assert.throws(() => rebindSkin(fixture, { path: contour.id }), /nonzero/);
  assert.deepEqual(exportRiv(fixture), invalidRebind, 'failed rebind does not partially mutate the document');
  bone.props.scaleX = 1;
  const posedGeometry = pathGeometry(contour, buildScene(artboard));
  rebindSkin(fixture, { path: contour.id });
  assert.deepEqual(pathGeometry(contour, buildScene(artboard)).points, posedGeometry.points, 'rebind preserves the posed contour');
  assert.deepEqual((await renderFixture('rebound'))(190, 140), originalPixel, 'rebind preserves runtime pixels');
  unbindSkin(fixture, { path: contour.id });
  assert.deepEqual((await renderFixture('detached'))(190, 140), originalPixel, 'unbinding bakes runtime deformation');
  assert.ok(points.every((vertex) => !childrenOf(artboard, vertex.id).some((object) => object.type === 'Weight')));

  const second = addBone(fixture, { name: 'Second', x: 300, y: 100, length: 80 });
  const third = addBone(fixture, { parent: second.id, length: 50 });
  const fourth = addBone(fixture, { parent: third.id, length: 20 });
  assert.throws(() => setBoneParent(fixture, { bone: second.id, parent: fourth.id }), /descendants/);
  const detachedBase = apply(buildScene(artboard).nodes.get(third.id)!.world, 0, 0);
  setBoneParent(fixture, { bone: third.id });
  assert.equal(third.type, 'RootBone');
  close(apply(buildScene(artboard).nodes.get(third.id)!.world, 0, 0), detachedBase, 'detaching a child preserves its world origin');
  setBoneParent(fixture, { bone: third.id, parent: second.id });
  assert.equal(third.type, 'Bone');
  close(apply(buildScene(artboard).nodes.get(third.id)!.world, 0, 0), apply(buildScene(artboard).nodes.get(second.id)!.world, 80, 0), 'relinking snaps to the parent tip');
  addSkin(fixture, { path: contour.id, bones: [bone.id, second.id] });
  for (const vertex of points) setSkinWeights(fixture, { vertex: vertex.id, influences: [{ index: 1, weight: 1 }] });
  const before = childrenOf(artboard, points[0]!.id)[0]!.props.values;
  const scene = buildScene(artboard), vc = vertexControls(points[0]!), world = apply(vertexWorldMatrix(scene, points[0]!), vc.x, vc.y);
  assert.ok(paintSkinWeights(fixture, { path: contour.id, bone: second.id, ...{ x: world[0], y: world[1] }, radius: 5, strength: 0.5 }) > 0, 'brush touches the expected deformed point');
  const painted = childrenOf(artboard, points[0]!.id)[0]!;
  assert.notEqual(painted.props.values, before);
  const shares = unpackInfluences(Number(painted.props.indices), Number(painted.props.values));
  close([shares.reduce((sum, item) => sum + item.weight, 0)], [1], 'brush stays normalized');
  assert.equal(paintSkinWeights(fixture, { path: contour.id, bone: second.id, x: -1000, y: -1000, radius: 5, strength: 0.5 }), 0, 'outside brush has no effect');
  assert.throws(() => paintSkinWeights(fixture, { path: contour.id, bone: second.id, x: 0, y: 0, radius: 0, strength: 0.5 }), /radius/);
  assert.throws(() => setSkinWeights(fixture, { vertex: points[0]!.id, influences: [{ index: 3, weight: 1 }] }), /this skin/);
  assert.throws(() => packInfluences([{ index: 1, weight: Number.NaN }]), /finite/);
  assert.throws(() => packInfluences([{ index: 1, weight: Number.MAX_VALUE }, { index: 2, weight: Number.MAX_VALUE }]), /finite/);
  assert.deepEqual(adjustInfluence([{ index: 1, weight: 1 }], 1, 0.5), [{ index: 1, weight: 0.5 }, { index: 0, weight: 0.5 }], 'subtracting the sole bone assigns the remainder to the unbound identity');
  convertVertexType(fixture, { vertex: points[0]!.id, type: 'CubicDetachedVertex' });
  const cubic = childrenOf(artboard, points[0]!.id)[0]!;
  setSkinWeights(fixture, { vertex: points[0]!.id, channel: 'in', influences: [{ index: 2, weight: 1 }] });
  assert.equal(cubic.props.inIndices, 2);
  assert.notEqual(cubic.props.indices, 2, 'handle weighting leaves the point unchanged');
  const snapshot = exportRiv(fixture);
  assert.throws(() => setSkinWeights(fixture, { vertex: points[0]!.id, channel: 'invalid' as 'point', influences: [{ index: 1, weight: 1 }] }), /channels/);
  assert.deepEqual(exportRiv(fixture), snapshot);
  cubic.props.inIndices = 250;
  assert.ok(diagnoseDocument(fixture).diagnostics.some((item) => item.code === 'invalid-skin-influence'), 'diagnostics find invalid cubic influences');
  cubic.props.inIndices = 2;
  autoWeightSkin(fixture, { path: contour.id });
  smoothSkinWeights(fixture, { path: contour.id });
  for (const vertex of points) {
    const weight = childrenOf(artboard, vertex.id)[0]!;
    close([unpackInfluences(Number(weight.props.indices), Number(weight.props.values)).reduce((sum, item) => sum + item.weight, 0)], [1], 'auto/smooth weights normalize');
  }
  const beforeDelete = pathGeometry(contour, buildScene(artboard)).points;
  deleteObjects(artboard, [bone.id]);
  assert.ok(!artboard.objects.some((object) => object.type === 'Tendon' && object.props.boneId === bone.id));
  const afterDelete = pathGeometry(contour, buildScene(artboard)).points;
  beforeDelete.forEach((point, index) => close(afterDelete[index]!, point, 'deleting a bound bone bakes the contour safely'));
  assert.deepEqual(exportRiv(importRiv(exportRiv(fixture))), exportRiv(fixture));
  await renderFixture('after-bone-delete');

  // Existing image meshes use triangle adjacency, not arbitrary vertex storage order.
  const texture = createCanvas(80, 20);
  const paint = texture.getContext('2d'); paint.fillStyle = '#ff3355'; paint.fillRect(0, 0, 80, 20);
  const asset = addImageAsset(fixture, 'Mesh texture', texture.toBuffer('image/png'), 80, 20);
  const image = placeImage(artboard, asset, 100, 300); image.props.originX = 0; image.props.originY = 0;
  const mesh = obj('Mesh', { parentId: image.id, triangleIndexBytes: new Uint8Array([0, 1, 2, 0, 2, 3]) });
  const meshVertices = [[0, 0, 0, 0], [80, 0, 1, 0], [80, 20, 1, 1], [0, 20, 0, 1]].map(([x, y, u, v]) => obj('MeshVertex', { parentId: mesh.id, x, y, u, v }));
  artboard.objects.push(mesh, ...meshVertices);
  assert.deepEqual((await renderFixture('mesh-unbound'))(140, 310), originalPixel);
  addSkin(fixture, { path: mesh.id, bones: [second.id] });
  assert.deepEqual((await renderFixture('mesh-bound'))(140, 310), originalPixel, 'binding an existing mesh preserves runtime pixels');
  assert.throws(() => convertVertexType(fixture, { vertex: meshVertices[0]!.id, type: 'StraightVertex' }), /path vertices/);
  second.props.x = 320;
  assert.deepEqual((await renderFixture('mesh-posed'))(160, 310), originalPixel, 'bound image mesh follows its bone');
  smoothSkinWeights(fixture, { path: mesh.id });
  unbindSkin(fixture, { path: mesh.id });
  assert.deepEqual((await renderFixture('mesh-detached'))(160, 310), originalPixel, 'mesh unbind bakes deformation');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log('✓ advanced rigging: runtime pixel parity, bind/rebind/unbind, linking, safe deletion, auto/smooth/paint weights, independent cubic handles, validation and byte-identical round-trips');
