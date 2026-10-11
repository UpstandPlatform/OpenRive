import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { addBone, addPath, addSkin, convertVertexType } from '@openrive/rive/api';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { newDoc } from '@openrive/rive/factory';
import { childrenOf } from '@openrive/rive/ops';

const doc = newDoc('Rigging test');
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
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log('✓ bone creation, bind-pose skinning, and weighted vertex round-trip');
