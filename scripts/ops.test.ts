import { newDoc, obj } from '@openrive/rive/factory';
import { KEYFRAME_TYPE, pasteKeyframes } from '@openrive/rive/ops';
import { propKey } from '@openrive/rive/schema';

const doc = newDoc('Keyframe paste');
const ab = doc.artboards[0]!;
const target = obj('GridItemPlacement', { parentId: ab.id, gridColumn: 3 });
ab.objects.push(target);
const animation = obj('LinearAnimation', { name: 'Integer keys', fps: 60, duration: 60 }, []);
const propertyKey = propKey('GridItemPlacement', 'gridColumn');

if (KEYFRAME_TYPE.int !== 'KeyFrameInt') {
  throw new Error('Integer properties must map to the Rive integer keyframe type');
}

const result = pasteKeyframes(
  ab,
  animation,
  {
    kind: 'openrive/keyframes',
    baseFrame: 0,
    entries: [{ objectId: target.id, propertyKey, type: 'KeyFrameInt', frame: 0, value: 3, interpolationType: 1 }],
  },
  0,
);
const key = animation.children?.[0]?.children?.[0]?.children?.[0];
if (result.skipped !== 0 || result.keyframes.length !== 1 || key?.type !== 'KeyFrameInt' || key.props.value !== 3) {
  throw new Error('Pasting an integer keyframe did not preserve its Rive keyframe type and value');
}

const mismatched = pasteKeyframes(
  ab,
  animation,
  {
    kind: 'openrive/keyframes',
    baseFrame: 0,
    entries: [{ objectId: target.id, propertyKey, type: 'KeyFrameDouble', frame: 1, value: 4.5, interpolationType: 1 }],
  },
  1,
);
if (mismatched.skipped !== 1 || mismatched.keyframes.length !== 0) {
  throw new Error('Pasting a keyframe with a mismatched property type should be skipped');
}

console.log('Keyframe paste tests passed');
