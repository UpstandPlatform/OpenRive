import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { convertLottie } from '@openrive/lottie';

const samplePath = path.resolve(import.meta.dir, 'fixtures/lottie/sample-animation.json.gz');
const sample = new Uint8Array(gunzipSync(readFileSync(samplePath)));
const font = {
  name: 'Inter',
  bytes: new Uint8Array(readFileSync(path.resolve(import.meta.dir, '../apps/web/public/fonts/Inter-Regular.ttf'))),
};
const { doc } = convertLottie(sample, 'Sample Animation.json', { font });
const artboard = doc.artboards[0]!;
const objects = artboard.objects;
const textRuns = objects.filter((object) => object.type === 'TextValueRun');
const feathers = objects.filter((object) => object.type === 'Feather');

assert.equal(artboard.stateMachines.length, 0, 'Lottie imports should run as timelines without the starter state machine.');
assert.ok(objects.filter((object) => object.type === 'Shape').length >= 100, 'The supplied animation should retain its vector artwork.');
assert.ok(textRuns.some((object) => object.props.text === 'Tap to flip'), 'The supplied animation text should remain editable.');
assert.equal(feathers.length, 1, 'The sample Gaussian Blur should become a Rive Feather.');
assert.equal(feathers[0]!.props.strength, 17.079);
assert.ok(objects.some((object) => object.type === 'Shape' && object.props.blendModeValue === 17), 'The sample Lighten blend mode should be retained.');

const riv = exportRiv(doc);
assert.deepEqual(exportRiv(importRiv(riv)), riv, 'The converted sample should survive a .riv import/export round trip.');

console.log(`Lottie sample: ${objects.length} Rive objects, ${textRuns.length} text runs, Gaussian Blur approximation, blend mode, and .riv round trip passed.`);
