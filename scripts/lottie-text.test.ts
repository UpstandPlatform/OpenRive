import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { convertLottie } from '@openrive/lottie';

const font = {
  name: 'Inter',
  bytes: new Uint8Array(readFileSync(path.resolve(import.meta.dir, '../apps/web/public/fonts/Inter-Regular.ttf'))),
};

function makeAnimation(textLayer: Record<string, unknown>) {
  return {
    v: '5.7.4', fr: 30, ip: 0, op: 60, w: 256, h: 128,
    layers: [
      {
        ddd: 0, ind: 1, ty: 5, nm: 'Label', sr: 1, ks: {
          o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [128, 64, 0] },
          a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] },
        }, ao: 0, ip: 0, op: 60, st: 0, bm: 0,
        t: {
          d: { k: [{ s: { f: 'Original Family', s: 32, t: 'Hello OpenRive', j: 1, tr: 0, fc: [0.25, 0.5, 1], sw: 0 }, t: 0 }] },
          a: [],
        },
        ...textLayer,
      },
    ],
  };
}

const bytes = (data: unknown) => new TextEncoder().encode(JSON.stringify(data));
const animation = makeAnimation({});
const converted = convertLottie(bytes(animation), 'static-text.json', { font });
const artboard = converted.doc.artboards[0]!;
const text = artboard.objects.find((object) => object.type === 'Text');
const run = artboard.objects.find((object) => object.type === 'TextValueRun');
const style = artboard.objects.find((object) => object.type === 'TextStylePaint');
assert.ok(text, 'A text-only animation should import as editable Rive text.');
assert.equal(run?.props.text, 'Hello OpenRive');
assert.equal(text.props.alignValue, 1, 'Right alignment should be retained.');
assert.equal(style?.props.fontSize, 32);
const textStyleFill = artboard.objects.find((object) => object.type === 'Fill' && object.props.parentId === style?.id);
const textColor = artboard.objects.find((object) => object.type === 'SolidColor' && object.props.parentId === textStyleFill?.id);
assert.equal(textColor?.props.colorValue, 0xff4080ff);
assert.ok(converted.doc.top.some((object) => object.type === 'FontAsset'), 'The fallback font must be embedded into the Rive document.');
assert.deepEqual(exportRiv(importRiv(exportRiv(converted.doc))), exportRiv(converted.doc), 'Text documents should survive a Rive round trip.');

const separatePosition = makeAnimation({});
separatePosition.layers[0]!.ks.p = {
  s: true,
  x: { a: 0, k: 128 },
  y: { a: 0, k: 64 },
  z: { a: 0, k: 0 },
};
const separatedDoc = convertLottie(bytes(separatePosition), 'separated-position.json', { font }).doc;
const labelTransform = separatedDoc.artboards[0]!.objects.find((object) => object.type === 'Node' && object.props.name === 'Label');
assert.equal(labelTransform?.props.x, 128);
assert.equal(labelTransform?.props.y, 64);

const matteShape = [
  { ty: 'rc', nm: 'Matte rectangle', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [50, 50] }, r: { a: 0, k: 0 } },
  { ty: 'fl', nm: 'Matte fill', c: { a: 0, k: [1, 1, 1] }, o: { a: 0, k: 100 }, r: 1 },
];
const matte = {
  v: '5.7.4', fr: 30, ip: 0, op: 60, w: 256, h: 128,
  layers: [
    { ddd: 0, ind: 1, ty: 4, nm: 'Target', tt: 1, tp: 2, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }, ip: 0, op: 60, shapes: matteShape },
    { ddd: 0, ind: 2, ty: 4, nm: 'Matte source', td: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }, ip: 0, op: 60, shapes: [matteShape[0]] },
  ],
};
const matteDoc = convertLottie(bytes(matte), 'alpha-matte.json', { font }).doc;
const clip = matteDoc.artboards[0]!.objects.find((object) => object.type === 'ClippingShape');
assert.ok(clip, 'A supported alpha track matte should become a Rive clipping shape.');
const matteSource = matteDoc.artboards[0]!.objects.find((object) => object.id === clip.props.sourceId);
assert.equal(Number(matteSource?.props.drawableFlags) & 1, 1, 'The matte source should not render as visible artwork.');
assert.deepEqual(exportRiv(importRiv(exportRiv(matteDoc))), exportRiv(matteDoc), 'Track matte documents should survive a Rive round trip.');

const layerShape = (name: string) => [
  { ty: 'el', nm: name, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [80, 60] } },
  { ty: 'fl', nm: `${name} Fill`, c: { a: 0, k: [0.4, 0.6, 1] }, o: { a: 0, k: 100 }, r: 1 },
];
const gaussianBlur = {
  ty: 29, nm: 'Gaussian Blur', en: 1,
  ef: [
    { ty: 0, nm: 'Blurriness', v: { a: 0, k: 17.079 } },
    { ty: 7, nm: 'Blur Dimensions', v: { a: 0, k: 1 } },
    { ty: 7, nm: ' ', v: { a: 0, k: 0 } },
  ],
};
const shapeLayer = (ind: number, name: string, bm: number, ef: unknown[] = []) => ({
  ddd: 0, ind, ty: 4, nm: name, sr: 1, ks: {
    o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [128, 64, 0] },
    a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] },
  }, ao: 0, ip: 0, op: 60, st: 0, bm, ef, shapes: layerShape(name),
});
const appearance = convertLottie(bytes({
  v: '5.7.4', fr: 30, ip: 0, op: 60, w: 256, h: 128,
  layers: [shapeLayer(1, 'Blurred Ellipse', 5, [gaussianBlur]), shapeLayer(2, 'Overlay Ellipse', 3)],
}), 'layer-appearance.json', { font }).doc;
const appearanceObjects = appearance.artboards[0]!.objects;
const blurredShape = appearanceObjects.find((object) => object.type === 'Shape' && object.props.name === 'Blurred Ellipse');
const overlayShape = appearanceObjects.find((object) => object.type === 'Shape' && object.props.name === 'Overlay Ellipse');
const feather = appearanceObjects.find((object) => object.type === 'Feather');
assert.equal(blurredShape?.props.blendModeValue, 17, 'Lottie Lighten should map to Rive Lighten.');
assert.equal(overlayShape?.props.blendModeValue, 15, 'Lottie Overlay should map to Rive Overlay.');
assert.equal(feather?.props.strength, 17.079, 'Gaussian Blur should map to an editable Rive Feather approximation.');
assert.deepEqual(exportRiv(importRiv(exportRiv(appearance))), exportRiv(appearance), 'Layer effects and blend modes should survive a Rive round trip.');

const multipleDrawables = shapeLayer(1, 'Multiple Drawables', 5);
multipleDrawables.shapes = [
  { ty: 'el', nm: 'First', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [40, 40] } },
  { ty: 'el', nm: 'Second', p: { a: 0, k: [30, 30] }, s: { a: 0, k: [40, 40] } },
  { ty: 'fl', nm: 'Fill', c: { a: 0, k: [0.4, 0.6, 1] }, o: { a: 0, k: 100 }, r: 1 },
];
assert.throws(
  () => convertLottie(bytes({ v: '5.7.4', fr: 30, ip: 0, op: 60, w: 256, h: 128, layers: [multipleDrawables] }), 'multiple-blend-targets.json', { font }),
  /non-normal layer blending is supported only when the layer contains one drawable/,
  'Layer blending that Rive cannot represent faithfully should fail clearly.',
);

assert.throws(
  () => convertLottie(bytes(animation), 'static-text.json'),
  /static text requires an embedded fallback font/,
  'Text conversion must not silently create a broken FontAsset reference.',
);

const animated = makeAnimation({
  t: {
    d: { k: [{ s: { f: 'Original Family', s: 32, t: 'Hello', j: 0, tr: 0, fc: [1, 1, 1], sw: 0 }, t: 0 }] },
    a: [{ a: { o: { a: 1, k: [{ t: 0, s: [100], e: [0] }] } } }],
  },
});
assert.throws(
  () => convertLottie(bytes(animated), 'animated-text.json', { font }),
  /animated or non-default text animator properties are not supported/,
  'Unsupported text animation should fail with a clear feature error.',
);

console.log('Lottie text: static text, embedded fallback font, Rive round trip, and unsupported animation checks passed.');
