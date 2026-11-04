// Artboards, timelines and state machines are addressable by the same
// id-or-name refs as components: set_properties renames/resizes artboards,
// delete_objects removes them, and the first state of a layer starts it.
import * as api from '@openrive/rive/api';
import { newDoc, obj } from '@openrive/rive/factory';

const fail = (message: string): never => {
  throw new Error(message);
};

const doc = newDoc('Artboard ops');
const first = doc.artboards[0]!;
const firstName = String(first.artboard.props.name);

// rename and resize by name, then by the new name
api.setProperties(doc, firstName, { name: 'Loader', width: 200, height: 120 });
if (first.artboard.props.name !== 'Loader' || first.artboard.props.width !== 200) fail('set_properties did not update the artboard by name');
api.setProperties(doc, 'Loader', { height: 200 });
if (first.artboard.props.height !== 200) fail('set_properties did not update the renamed artboard');

// A component and artboard can have the same name; edits must reject the
// ambiguous name instead of silently changing whichever is searched first.
const nameCollision = obj('Node', { name: 'Loader' });
first.objects.push(nameCollision);
let ambiguousEdit = false;
try {
  api.setProperties(doc, 'Loader', { height: 300 });
} catch (e) {
  ambiguousEdit = e instanceof api.ApiError && e.message.includes('matches multiple');
}
if (!ambiguousEdit || first.artboard.props.height !== 200 || nameCollision.props.name !== 'Loader') fail('set_properties must reject ambiguous object/artboard names');
first.objects = first.objects.filter((object) => object !== nameCollision);

// deleting the only artboard is refused, not silently skipped
let refused = false;
try {
  api.deleteObjectsByRef(doc, ['Loader']);
} catch (e) {
  refused = e instanceof api.ApiError;
}
if (!refused || doc.artboards.length !== 1) fail('deleting the last artboard must fail loudly');

// a second artboard can be deleted by id
const extra = api.addArtboard(doc, { name: 'Scratch' });
const artboardRef = obj('ViewModelInstanceArtboard', { propertyValue: extra.id });
doc.top.push(artboardRef);
api.deleteObjectsByRef(doc, [extra.id]);
if (doc.artboards.some((a) => a.id === extra.id)) fail('delete_objects did not remove the artboard');
if (artboardRef.props.propertyValue !== -1) fail('deleting an artboard did not clear references to it');

// Timeline names can repeat on different artboards, so deletion refuses an
// ambiguous name instead of removing whichever match happened to come first.
const other = api.addArtboard(doc, { name: 'Other' });
let ambiguous = false;
try {
  api.deleteObjectsByRef(doc, ['Timeline 1']);
} catch (e) {
  ambiguous = e instanceof api.ApiError && e.message.includes('use its id');
}
if (!ambiguous || !first.animations.some((a) => a.props.name === 'Timeline 1') || !other.animations.some((a) => a.props.name === 'Timeline 1')) {
  fail('delete_objects must reject duplicate timeline names without deleting either match');
}
api.deleteObjectsByRef(doc, [other.id]);

// a new state machine starts with its first state; later states do not steal entry
api.addAnimation(doc, { artboard: 'Loader', name: 'spin', duration: 1 });
api.addAnimation(doc, { artboard: 'Loader', name: 'idle', duration: 1 });
const sm = api.addStateMachine(doc, { artboard: 'Loader', name: 'Machine' });
const spin = api.addState(doc, { artboard: 'Loader', stateMachine: 'Machine', animation: 'spin' });
api.addState(doc, { artboard: 'Loader', stateMachine: 'Machine', animation: 'idle' });
const layer = sm.children!.find((c) => c.type === 'StateMachineLayer')!;
const entry = layer.children!.find((c) => c.type === 'EntryState')!;
const entryTargets = () => (entry.children ?? []).map((t) => t.props.stateToId);
if (entryTargets().join() !== spin.id) fail(`entry should lead to the first state, got ${entryTargets()}`);

// an explicit unconditional entry transition replaces the automatic one
api.addTransition(doc, { artboard: 'Loader', stateMachine: 'Machine', from: 'entry', to: 'idle' });
if (entryTargets().length !== 1 || entryTargets()[0] === spin.id) fail('explicit entry transition did not replace the automatic one');

// Blend states participate in the same first-state entry rule.
const blendMachine = api.addStateMachine(doc, { artboard: 'Loader', name: 'Blend machine' });
const blendState = api.addBlendState(doc, {
  artboard: 'Loader',
  stateMachine: 'Blend machine',
  animations: [{ animation: 'idle', value: 0 }],
});
api.addState(doc, { artboard: 'Loader', stateMachine: 'Blend machine', animation: 'spin' });
const blendLayer = blendMachine.children!.find((c) => c.type === 'StateMachineLayer')!;
const blendEntry = blendLayer.children!.find((c) => c.type === 'EntryState')!;
if (blendEntry.children?.[0]?.props.stateToId !== blendState.id) fail('a first blend state should become the entry state');

// deleting a timeline removes its states and transitions into them
api.addTransition(doc, { artboard: 'Loader', stateMachine: 'Machine', from: 'idle', to: 'spin' });
const nestedAnimation = obj('NestedSimpleAnimation', { animationId: spin.id });
first.objects.push(nestedAnimation);
api.deleteObjectsByRef(doc, ['spin']);
const ab = doc.artboards[0]!;
if (ab.animations.some((a) => a.props.name === 'spin')) fail('timeline was not deleted');
if (layer.children!.some((s) => s.props.animationId !== undefined && !ab.animations.some((a) => a.id === s.props.animationId))) fail('a state still plays the deleted timeline');
if (layer.children!.some((s) => (s.children ?? []).some((t) => t.props.stateToId === spin.id))) fail('a transition still targets the deleted state');
if (nestedAnimation.props.animationId !== -1) fail('deleting a timeline did not clear nested animation references');

// Removing the last timeline from a blend state removes the now-empty state
// and restores Entry to the first playable state that remains.
const fallback = api.addAnimation(doc, { artboard: 'Loader', name: 'fallback', duration: 1 });
const fallbackState = api.addState(doc, { artboard: 'Loader', stateMachine: 'Blend machine', animation: 'fallback' });
blendEntry.children!.push(obj('StateTransition', { stateToId: fallbackState.id }, [obj('TransitionCondition')]));
api.deleteObjectsByRef(doc, ['idle']);
if (blendLayer.children!.some((state) => state.id === blendState.id)) fail('deleting the final blend timeline should remove the empty blend state');
if (blendEntry.children?.[0]?.props.stateToId !== fallbackState.id) fail('deleting the entry state should route Entry to a remaining playable state');
if (!blendEntry.children?.some((transition) => transition.props.stateToId === fallbackState.id && !(transition.children ?? []).length)) {
  fail('a conditional Entry transition should not replace the unconditional fallback after deleting its initial state');
}
if (!ab.animations.some((animation) => animation.id === fallback.id)) fail('unrelated timelines should remain intact');

// state machines by name
api.addStateMachine(doc, { artboard: 'Loader', name: 'Default replacement' });
first.artboard.props.defaultStateMachineId = sm.id;
const nestedMachine = obj('NestedStateMachine', { animationId: sm.id });
first.objects.push(nestedMachine);
api.deleteObjectsByRef(doc, ['Machine']);
if (ab.stateMachines.some((m) => m.props.name === 'Machine')) fail('state machine was not deleted');
const replacementMachineId = ab.stateMachines[0]?.id ?? -1;
if (first.artboard.props.defaultStateMachineId !== replacementMachineId) fail('deleting the default state machine should select the first remaining machine');
if (nestedMachine.props.animationId !== -1) fail('deleting a state machine did not clear nested state machine references');

console.log('artboard ops ok');
