// Rive Markup Language import: parsing, references, enum names, editor
// defaults and the nesting rules the Rive CLI applies.
import { exportRiv, importRiv } from '@openrive/rive/document';
import { importRml, parseRml } from '@openrive/rive/rml';
import { readRiv } from '@openrive/rive/riv-format';
import { propKey, typeDefByKey } from '@openrive/rive/schema';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const typesOf = (bytes: Uint8Array) => readRiv(bytes).objects.map((o) => typeDefByKey(o.typeKey)?.name ?? `#${o.typeKey}`);
const propsOf = (bytes: Uint8Array, type: string) => {
  const o = readRiv(bytes).objects.find((x) => typeDefByKey(x.typeKey)?.name === type);
  return new Map(o?.props.map((p) => [p.key, p.value]));
};

// --- parser ----------------------------------------------------------------

const tree = parseRml('<?xml version="1.0"?>\n<!-- c --><Rive version="1" kind="fragment"><A x="1 &amp; 2"><B/></A></Rive>');
assert(tree.tag === 'Rive' && tree.children[0].attrs.x === '1 & 2' && tree.children[0].children[0].tag === 'B', 'parses elements, entities and comments');
let rejected = false;
try {
  parseRml('<Rive><A></B></Rive>');
} catch {
  rejected = true;
}
assert(rejected, 'rejects mismatched tags');

// malformed input must fail with an error, never hang or throw something obscure
const rejects = (src: string, pattern: RegExp, message: string) => {
  try {
    parseRml(src);
  } catch (error) {
    assert(pattern.test((error as Error).message), `${message}: got "${(error as Error).message}"`);
    return;
  }
  throw new Error(`${message}: was accepted`);
};
// a closing tag that never ends used to send the cursor back to the start and loop forever
rejects('<a></aa', /unterminated closing tag/, 'an unterminated closing tag');
rejects('<a></a', /unterminated closing tag/, 'an unterminated closing tag at the end');
rejects('</Rive>', /no matching opening tag/, 'a closing tag with nothing open');
rejects('<Rive><A/></Rive></Rive>', /no matching opening tag/, 'an extra closing tag');
assert(parseRml('<Rive><A x="&#99999999;&#x1F600;&#65;"/></Rive>').children[0].attrs.x === '&#99999999;😀A', 'character references outside Unicode stay as written');
assert(parseRml('<Rive><A x="&constructor;&toString;"/></Rive>').children[0].attrs.x === '&constructor;&toString;', 'unknown entity names stay as written');

// --- a small animated scene --------------------------------------------------

const scene = `<Rive version="1" kind="fragment">
  <Artboard defaultStateMachineId="0:7" width="400" height="300" name="Hello" id="0:2">
    <Fill><SolidColor colorValue="1D1D1D"/></Fill>
    <Shape x="200" y="150" hidden="true" name="Dot" id="0:14">
      <Ellipse width="160" height="160"/>
      <Fill><SolidColor colorValue="FFFF2D8A"/></Fill>
    </Shape>
    <LinearAnimation duration="60" loopValue="pingPong" name="pulse" id="0:20">
      <KeyedObject objectId="0:14">
        <KeyedProperty property="scaleX">
          <KeyFrameDouble frame="0" value="1" interpolationType="linear"/>
          <KeyFrameDouble frame="60" value="1.4"/>
        </KeyedProperty>
      </KeyedObject>
    </LinearAnimation>
    <StateMachine name="Main" id="0:7">
      <StateMachineLayer name="Layer">
        <EntryState><StateTransition stateToId="0:30" enableEarlyExit="true"/></EntryState>
        <AnimationState animationId="0:20" id="0:30"/>
      </StateMachineLayer>
    </StateMachine>
  </Artboard>
</Rive>`;
const { doc, warnings } = importRml(scene, { keepAnimationNames: true });
assert(warnings.length === 0, `clean import (${warnings.join('; ')})`);
const riv = exportRiv(doc);
const types = typesOf(riv);
assert(types[0] === 'Backboard' && types[1] === 'Artboard', 'file starts with a Backboard and the artboard');
assert(propsOf(riv, 'Artboard').get(propKey('Artboard', 'clip')) === false, 'artboards default to clip=false, like the editor');
assert(propsOf(riv, 'SolidColor').get(propKey('SolidColor', 'colorValue')) === 0xff1d1d1d, 'six-digit colors are opaque');
assert(propsOf(riv, 'Shape').get(propKey('Shape', 'drawableFlags')) === 1, 'hidden="true" sets the hidden drawable flag');
assert(propsOf(riv, 'KeyedProperty').get(propKey('KeyedProperty', 'propertyKey')) === propKey('Shape', 'scaleX'), 'property="scaleX" resolves on the keyed object type');
assert(propsOf(riv, 'LinearAnimation').get(propKey('LinearAnimation', 'loopValue')) === 2, 'enum names resolve (pingPong)');
assert(propsOf(riv, 'KeyFrameDouble').get(propKey('KeyFrameDouble', 'interpolationType')) === 1, 'interpolation names resolve (linear)');
assert(propsOf(riv, 'StateTransition').get(propKey('StateTransition', 'flags')) === 32, 'enableEarlyExit sets the transition flag');
const layerStates = types.slice(types.indexOf('StateMachineLayer') + 1).filter((t) => t.endsWith('State'));
assert(layerStates.join() === 'EntryState,AnimationState,AnyState,ExitState', `missing Any and Exit states are added (${layerStates})`);
const transition = propsOf(riv, 'StateTransition');
assert(transition.get(propKey('StateTransition', 'stateToId')) === 1, 'stateToId indexes the layer states');
assert(importRiv(riv).artboards[0].animations[0].props.name === 'pulse', 'keepAnimationNames keeps names for the editor');
assert(importRml(scene).doc.artboards[0].animations[0].props.name === undefined, 'the CLI drops names of animations only a state machine plays');

// --- data binding ------------------------------------------------------------

const bound = `<Rive version="1" kind="fragment">
  <Artboard viewModelId="0:900" width="100" height="100" name="root" id="0:1">
    <Node name="dot" id="0:101">
      <DataBindContext sourcePathIds="0:900-0:904" propertyKey="13"/>
    </Node>
  </Artboard>
  <ViewModel name="VM" id="0:900">
    <ViewModelPropertyNumber name="a" id="0:902"/>
    <ViewModelPropertyNumber name="b" id="0:904"/>
    <ViewModelInstance id="0:901">
      <ViewModelInstanceNumber propertyValue="5" viewModelPropertyId="0:904"/>
    </ViewModelInstance>
  </ViewModel>
</Rive>`;
const boundRiv = exportRiv(importRml(bound).doc);
const boundTypes = typesOf(boundRiv);
assert(boundTypes.indexOf('ViewModel') < boundTypes.indexOf('Artboard'), 'view models come before artboards');
assert([...(propsOf(boundRiv, 'DataBindContext').get(propKey('DataBindContext', 'sourcePathIds')) as Uint8Array)].join() === '0,1', 'bind paths index the view model, then its property');
assert(propsOf(boundRiv, 'ViewModelInstanceNumber').get(propKey('ViewModelInstanceNumber', 'viewModelPropertyId')) === 1, 'instance values index their property');
assert(propsOf(boundRiv, 'ViewModelInstance').get(propKey('ViewModelInstance', 'name')) === 'Instance', 'unnamed instances get the editor name');

// --- multiple files and the main artboard ------------------------------------

const a = '<Rive version="1" kind="fragment"><Artboard width="10" height="10" name="A" id="0:1"/></Rive>';
const b = '<Rive version="1" kind="fragment"><Artboard width="10" height="10" name="B" id="1:1"/></Rive>';
assert(importRml([a, b], { main: 'B' }).doc.artboards.map((x) => x.artboard.props.name).join() === 'B,A', 'files compile together, main artboard first');

console.log('rml tests passed');
