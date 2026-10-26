// Artboards, timelines and state machines are addressable by the same
// id-or-name refs as components: set_properties renames/resizes artboards,
// delete_objects removes them, and the first state of a layer starts it.
import * as api from '@openrive/rive/api';
import { newDoc } from '@openrive/rive/factory';

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
api.deleteObjectsByRef(doc, [extra.id]);
if (doc.artboards.some((a) => a.id === extra.id)) fail('delete_objects did not remove the artboard');

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

// deleting a timeline removes its states and transitions into them
api.addTransition(doc, { artboard: 'Loader', stateMachine: 'Machine', from: 'idle', to: 'spin' });
api.deleteObjectsByRef(doc, ['spin']);
const ab = doc.artboards[0]!;
if (ab.animations.some((a) => a.props.name === 'spin')) fail('timeline was not deleted');
if (layer.children!.some((s) => s.props.animationId !== undefined && !ab.animations.some((a) => a.id === s.props.animationId))) fail('a state still plays the deleted timeline');
if (layer.children!.some((s) => (s.children ?? []).some((t) => t.props.stateToId === spin.id))) fail('a transition still targets the deleted state');

// state machines by name
api.deleteObjectsByRef(doc, ['Machine']);
if (ab.stateMachines.some((m) => m.props.name === 'Machine')) fail('state machine was not deleted');

console.log('artboard ops ok');
