import assert from 'node:assert/strict';
import { convertLottie } from '@openrive/lottie';

const square = (left: number, top: number) => ({
  a: 0,
  k: {
    c: true,
    v: [[left, top], [left + 10, top], [left + 10, top + 10], [left, top + 10]],
    i: [[0, 0], [0, 0], [0, 0], [0, 0]],
    o: [[0, 0], [0, 0], [0, 0], [0, 0]],
  },
});

const source = {
  v: '5.7.4', fr: 30, ip: 0, op: 30, w: 100, h: 100, assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 4, nm: 'Compound', sr: 1, ao: 0, ip: 0, op: 30, st: 0, bm: 0,
    ks: {
      o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0] },
      a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] },
    },
    shapes: [
      { ty: 'sh', nm: 'Outer', ks: square(0, 0) },
      { ty: 'sh', nm: 'Inner', ks: square(2, 2) },
      { ty: 'fl', nm: 'Even Odd Fill', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 }, r: 2 },
      { ty: 'tr', nm: 'Transform', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] },
        s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
    ],
  }],
};

const { doc } = convertLottie(new TextEncoder().encode(JSON.stringify(source)));
const objects = doc.artboards[0]!.objects;
const shapes = objects.filter((object) => object.type === 'Shape');
assert.equal(shapes.length, 1, 'path-only Lottie geometry should share the group Shape');
assert.equal(objects.filter((object) => object.type === 'PointsPath').length, 2, 'both compound contours must remain');
const fills = objects.filter((object) => object.type === 'Fill' && object.props.parentId === shapes[0]!.id);
assert.equal(fills.length, 1, 'the compound should have one fill carrying its fill rule');
assert.equal(fills[0]!.props.fillRule, 1, 'even-odd fill rule should be preserved');

console.log('Lottie compound paths retain both contours under one even-odd fill.');
