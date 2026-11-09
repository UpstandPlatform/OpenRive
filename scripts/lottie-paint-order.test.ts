// Lottie draws a group's first style on top, Rive draws a shape's first paint underneath:
// the converter must flip the order so a stroke listed before its fill stays visible.
import assert from 'node:assert/strict';
import { convertLottie } from '@openrive/lottie';

const group = (items: object[]) => ({
  v: '5.9.0', fr: 24, ip: 0, op: 24, w: 200, h: 200, assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 4, nm: 'shape', sr: 1, ao: 0, ip: 0, op: 24, st: 0, bm: 0,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
    shapes: [{ ty: 'gr', it: [...items,
      { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }],
  }],
});
const rect = { ty: 'rc', d: 1, p: { a: 0, k: [100, 100] }, s: { a: 0, k: [120, 120] }, r: { a: 0, k: 0 } };
const stroke = { ty: 'st', c: { a: 0, k: [0, 0, 0, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 12 }, lc: 2, lj: 2 };
const fill = { ty: 'fl', c: { a: 0, k: [1, 0.5, 0.3, 1] }, o: { a: 0, k: 100 }, r: 1 };

const paintTypes = (items: object[]) => {
  const { doc } = convertLottie(new TextEncoder().encode(JSON.stringify(group(items))));
  const objects = doc.artboards[0]!.objects;
  const shape = objects.find((o) => o.type === 'Shape')!;
  return objects.filter((o) => o.props.parentId === shape.id && (o.type === 'Fill' || o.type === 'Stroke')).map((o) => o.type);
};

// stroke listed first => on top in Lottie => must come AFTER the fill in Rive
assert.deepEqual(paintTypes([rect, stroke, fill]), ['Fill', 'Stroke']);
// fill listed first => on top in Lottie => must come after the stroke in Rive
assert.deepEqual(paintTypes([rect, fill, stroke]), ['Stroke', 'Fill']);
console.log('Lottie paint order is flipped for Rive.');
