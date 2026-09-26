// Data binding: authored view model properties must round-trip byte for byte,
// and converting a file's state machine inputs must leave an equivalent file
// that no longer uses the deprecated inputs.
import { readFileSync, writeFileSync } from 'fs';
import {
  addProperty,
  convertInputsToProperties,
  decodePath,
  encodePath,
  findProperty,
  properties,
  propertyCondition,
  propertyListenerAction,
  propertyValue,
  removeProperty,
  setPropertyValue,
  usesInputs,
  viewModels,
} from '@openrive/rive/databind';
import { addAnimation, addListener, addState, addStateMachine, addTransition } from '@openrive/rive/api';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { newDoc, newParametricShape } from '@openrive/rive/factory';
import { getTemplate } from '@openrive/rive/templates';

const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));
const roundTrip = (label: string, bytes: Uint8Array) => {
  const back = exportRiv(importRiv(bytes));
  console.log(`${label}: ${bytes.length} bytes ${same(bytes, back) ? 'IDENTICAL' : 'DIFF'}`);
  return back;
};

// --- varuint paths ---------------------------------------------------------
const paths = [[0, 0], [1, 5], [0, 200], [3, 1000]];
console.log('paths:', paths.map((p) => `${p.join('.')}→${[...encodePath(p)].join(',')}→${decodePath(encodePath(p)).join('.')}`).join('  '));
console.log('paths round-trip:', paths.every((p) => decodePath(encodePath(p)).join() === p.join()) ? 'ok' : 'BROKEN');

// --- authoring from scratch ------------------------------------------------
const doc = newDoc('Button');
const ab = doc.artboards[0]!;
ab.objects.push(...newParametricShape('rectangle', ab.id, 250, 250, 200, 80, 0xff3d8bd0));
const shape = ab.objects.find((o) => o.type === 'Shape')!;
addAnimation(doc, { artboard: ab.id, name: 'Idle' });
addAnimation(doc, { artboard: ab.id, name: 'Hover' });
const sm = addStateMachine(doc, { artboard: ab.id, name: 'Button' });
addState(doc, { artboard: ab.id, stateMachine: sm.id, animation: 'Idle' });
addState(doc, { artboard: ab.id, stateMachine: sm.id, animation: 'Hover' });

const isHover = addProperty(doc, ab, { name: 'isHover', type: 'boolean', value: false });
const press = addProperty(doc, ab, { name: 'press', type: 'trigger' });
const count = addProperty(doc, ab, { name: 'count', type: 'number', value: 3 });
addProperty(doc, ab, { name: 'label', type: 'string', value: 'Click me' });
console.log(
  'properties:',
  properties(doc, ab)
    .map((p) => `${p.name}:${p.type}@${p.viewModelIndex}.${p.index}=${JSON.stringify(propertyValue(p))}`)
    .join(' '),
);

// conditions and listener actions built from those properties
const entry = (sm.children![0]!.children ?? []).find((s) => s.type === 'EntryState')!;
addTransition(doc, { artboard: ab.id, stateMachine: sm.id, from: 'entry', to: 'Idle' });
const toHover = addTransition(doc, { artboard: ab.id, stateMachine: sm.id, from: 'Idle', to: 'Hover' });
toHover.children = [propertyCondition(isHover, '==', true)];
const toIdle = addTransition(doc, { artboard: ab.id, stateMachine: sm.id, from: 'Hover', to: 'Idle' });
toIdle.children = [propertyCondition(isHover, '==', false), propertyCondition(count, '>', 1)];
const fired = addTransition(doc, { artboard: ab.id, stateMachine: sm.id, from: 'Hover', to: 'Idle' });
fired.children = [propertyCondition(press)];
console.log('entry state kept:', !!entry);

const enter = addListener(doc, { artboard: ab.id, stateMachine: sm.id, target: shape.id, event: 'enter', name: 'onEnter', actions: [] });
enter.children = propertyListenerAction(isHover, true);
const leave = addListener(doc, { artboard: ab.id, stateMachine: sm.id, target: shape.id, event: 'exit', name: 'onExit', actions: [] });
leave.children = propertyListenerAction(isHover, false);
const click = addListener(doc, { artboard: ab.id, stateMachine: sm.id, target: shape.id, event: 'click', name: 'onClick', actions: [] });
click.children = propertyListenerAction(press);

const authored = exportRiv(doc);
roundTrip('authored', authored);
writeFileSync('scripts/databind-test-out.riv', authored);

const reread = importRiv(authored);
const rab = reread.artboards[0]!;
console.log(
  'reread:',
  viewModels(reread).map((v) => `${v.name}[${v.properties.map((p) => `${p.name}:${p.type}`).join(',')}]`).join(' '),
  '| artboard bound to model',
  rab.artboard.props.viewModelId,
  '| inputs used:',
  usesInputs(rab),
);

// --- editing properties ----------------------------------------------------
setPropertyValue(doc, ab, 'count', 42);
console.log('set value:', propertyValue(findProperty(doc, ab, 'count')!));
removeProperty(doc, ab, 'press');
const after = properties(doc, ab);
const pressGone = !findProperty(doc, ab, 'press');
const reindexed = after.every((p, i) => p.index === i && Number(p.value?.props.viewModelPropertyId ?? i) === i);
const firedDropped = (fired.children ?? []).length === 0;
console.log(`removed "press": gone=${pressGone} reindexed=${reindexed} its condition dropped=${firedDropped}`);
console.log('remaining:', after.map((p) => `${p.name}@${p.index}`).join(' '));
roundTrip('after edits', exportRiv(doc));

// --- converting a template's inputs ---------------------------------------
const font = { name: 'Inter', bytes: new Uint8Array(readFileSync('apps/web/public/fonts/Inter-Regular.ttf')) };
for (const id of ['interactive-button', 'toggle-switch', 'favorite-star']) {
  const t = getTemplate(id)!.build(font);
  const tab = t.artboards[0]!;
  const beforeBytes = exportRiv(t);
  const result = convertInputsToProperties(t, tab);
  const bytes = exportRiv(t);
  const back = importRiv(bytes);
  console.log(
    `${id}: +${result.properties.length} properties (${result.properties.join(', ')}) ` +
      `${result.conditions} conditions, ${result.actions} actions, kept ${result.kept.length}` +
      ` | inputs before ${usesInputs(importRiv(beforeBytes).artboards[0]!)} after ${usesInputs(back.artboards[0]!)}` +
      ` | ${same(bytes, exportRiv(back)) ? 'IDENTICAL' : 'DIFF'} round-trip`,
  );
  if (id === 'interactive-button') writeFileSync('scripts/databind-converted.riv', bytes);
}

