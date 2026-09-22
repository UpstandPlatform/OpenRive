// Brand templates: the OpenRive logo (interactive eye) and the Upstand logo.
import {
  addAnimation,
  addClip,
  addDistanceConstraint,
  addInput,
  addKeyframes,
  addListener,
  addPath,
  addShape,
  addState,
  addStateMachine,
  addTransition,
  applyThemeColor,
  defineColor,
  getArtboard,
  getObject,
} from './api';
import { newLayer, obj, newDoc } from './factory';
import { RiveDoc } from './document';
import { insertObjects, moveBefore, reparent } from './ops';
import { OPENRIVE_LOGO_SVG } from './logo-svg';
import { importSvg } from './svg';
import { addTheme, applyTheme, setSwatchColor } from './theme';
import type { Template } from './templates';

function base(name: string, width: number, height: number, bg: string): RiveDoc {
  const doc = newDoc(name);
  const ab = doc.artboards[0];
  ab.artboard.props.width = width;
  ab.artboard.props.height = height;
  ab.animations = [];
  ab.stateMachines = [];
  defineColor(doc, 'Background', bg);
  applyThemeColor(doc, ab.artboard.id, 'Background');
  return doc;
}

/** Adds a layer to a state machine and returns its name. */
function addLayer(doc: RiveDoc, sm: string, name: string) {
  const ab = getArtboard(doc);
  const machine = ab.stateMachines.find((m) => m.props.name === sm)!;
  machine.children!.push(newLayer(name));
  return name;
}

export const openriveLogo: Template = {
  id: 'openrive-logo',
  name: 'OpenRive Logo',
  description: 'The OpenRive logo with an eye that follows your cursor, dilates on hover, blinks, and bounces when clicked.',
  learn: ['SVG import', 'Align-to-pointer listeners', 'Distance constraints', 'Multiple state machine layers'],
  build() {
    const doc = base('OpenRive Logo', 500, 500, '#f5f5f2');
    const ab = getArtboard(doc);
    defineColor(doc, 'Ink', '#1d1d1b');
    defineColor(doc, 'Brand', '#0068ff');
    defineColor(doc, 'Glint', '#ffffff');

    const { group, shapes } = importSvg(OPENRIVE_LOGO_SVG, { artboard: ab, x: 250, y: 250, width: 300, name: 'Logo', names: ['Letter', 'Eye', 'Iris', 'Glint'] });
    const [, eye, iris, glint] = shapes;
    // group the eye parts around the eye's center so it can blink and act as the constraint anchor
    const eyeGroup = obj('Node', { name: 'Eye Group', parentId: group.id, x: eye.props.x, y: eye.props.y });
    insertObjects(ab, [eyeGroup], glint.id);
    for (const s of [glint, iris, eye]) reparent(ab, s.id, eyeGroup.id);

    applyThemeColor(doc, 'Letter', 'Ink');
    applyThemeColor(doc, 'Eye', 'Ink');
    applyThemeColor(doc, 'Iris', 'Brand');
    applyThemeColor(doc, 'Glint', 'Glint');

    // the iris stays inside the eye, the glint inside the iris
    addDistanceConstraint(doc, { object: 'Iris', target: 'Eye Group', distance: 11.5 });
    addDistanceConstraint(doc, { object: 'Glint', target: 'Iris', distance: 9 });

    // timelines
    addAnimation(doc, { name: 'Intro', duration: 0.9, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Intro', object: 'Logo', property: 'opacity', keys: [{ frame: 0, value: 0, ease: 'easeOut' }, { frame: 24, value: 1 }] });
    // the Logo group's scale fits the SVG to 300px; keep that as the rest value
    const rest = group.props.scaleX as number;
    for (const p of ['scaleX', 'scaleY'])
      addKeyframes(doc, {
        animation: 'Intro',
        object: 'Logo',
        property: p,
        keys: [
          { frame: 0, value: rest * 0.6, ease: 'easeOutBack' },
          { frame: 42, value: rest },
        ],
      });

    addAnimation(doc, { name: 'Blink', duration: 3.6, loop: 'loop' });
    addKeyframes(doc, {
      animation: 'Blink',
      object: 'Eye Group',
      property: 'scaleY',
      keys: [
        { frame: 0, value: 1 },
        { frame: 196, value: 1, ease: 'easeIn' },
        { frame: 202, value: 0.08, ease: 'easeOut' },
        { frame: 210, value: 1 },
        { frame: 216, value: 1 },
      ],
    });

    addAnimation(doc, { name: 'Calm', duration: 0.25, loop: 'oneShot' });
    for (const o of ['Iris', 'Glint']) for (const p of ['scaleX', 'scaleY']) addKeyframes(doc, { animation: 'Calm', object: o, property: p, keys: [{ frame: 0, value: 1 }] });
    addAnimation(doc, { name: 'Dilate', duration: 0.35, loop: 'oneShot' });
    for (const [o, v] of [
      ['Iris', 1.28],
      ['Glint', 1.4],
    ] as const)
      for (const p of ['scaleX', 'scaleY'])
        addKeyframes(doc, { animation: 'Dilate', object: o, property: p, keys: [{ frame: 0, value: 1, ease: 'easeOutBack' }, { frame: 18, value: v }] });

    addAnimation(doc, { name: 'Still', duration: 0.1, loop: 'oneShot' });
    addAnimation(doc, { name: 'Poke', duration: 0.6, loop: 'oneShot' });
    for (const p of ['scaleX', 'scaleY'])
      addKeyframes(doc, {
        animation: 'Poke',
        object: 'Logo',
        property: p,
        keys: [
          { frame: 0, value: rest, ease: 'easeOut' },
          { frame: 6, value: rest * 0.92, ease: 'easeOutBack' },
          { frame: 24, value: rest * 1.06, ease: 'easeInOut' },
          { frame: 36, value: rest },
        ],
      });
    addKeyframes(doc, {
      animation: 'Poke',
      object: 'Letter',
      property: 'rotationDegrees',
      keys: [
        { frame: 0, value: 0, ease: 'easeOut' },
        { frame: 8, value: -4, ease: 'easeInOut' },
        { frame: 20, value: 3, ease: 'easeInOut' },
        { frame: 32, value: 0 },
      ],
    });

    // state machine with three independent layers
    addStateMachine(doc, { name: 'Logo' });
    addInput(doc, { type: 'boolean', name: 'hover' });
    addInput(doc, { type: 'trigger', name: 'poke' });
    const machine = ab.stateMachines[0];
    machine.children!.find((c) => c.type === 'StateMachineLayer')!.props.name = 'Click';
    addState(doc, { layer: 'Click', animation: 'Intro', x: 200, y: 20 });
    addState(doc, { layer: 'Click', animation: 'Still', x: 380, y: 20 });
    addState(doc, { layer: 'Click', animation: 'Poke', x: 380, y: 100 });
    addTransition(doc, { layer: 'Click', from: 'entry', to: 'Intro' });
    addTransition(doc, { layer: 'Click', from: 'Intro', to: 'Still', exitTimeMs: 900 });
    addTransition(doc, { layer: 'Click', from: 'Still', to: 'Poke', conditions: [{ input: 'poke' }] });
    addTransition(doc, { layer: 'Click', from: 'Poke', to: 'Still', exitTimeMs: 600 });

    addLayer(doc, 'Logo', 'Blink');
    addState(doc, { layer: 'Blink', animation: 'Blink', x: 200, y: 20 });
    addTransition(doc, { layer: 'Blink', from: 'entry', to: 'Blink' });

    addLayer(doc, 'Logo', 'Hover');
    addState(doc, { layer: 'Hover', animation: 'Calm', x: 200, y: 20 });
    addState(doc, { layer: 'Hover', animation: 'Dilate', x: 380, y: 20 });
    addTransition(doc, { layer: 'Hover', from: 'entry', to: 'Calm' });
    addTransition(doc, { layer: 'Hover', from: 'Calm', to: 'Dilate', conditions: [{ input: 'hover', value: true }] });
    addTransition(doc, { layer: 'Hover', from: 'Dilate', to: 'Calm', durationMs: 200, conditions: [{ input: 'hover', value: false }] });

    // a transparent full-artboard shape catches pointer moves anywhere (drawn behind everything)
    const hit = addShape(doc, { kind: 'rectangle', name: 'Hit Area', x: 250, y: 250, width: 500, height: 500, fill: '#ffffff00' });
    moveBefore(ab, hit.id, null, ab.artboard.id); // last = drawn at the back
    addListener(doc, { target: 'Hit Area', event: 'move', name: 'Look at pointer', actions: [{ alignTarget: 'Iris' }, { alignTarget: 'Glint' }] });
    addListener(doc, { target: 'Eye', event: 'enter', name: 'Hover eye', actions: [{ input: 'hover', value: true }] });
    addListener(doc, { target: 'Eye', event: 'exit', name: 'Leave eye', actions: [{ input: 'hover', value: false }] });
    addListener(doc, { target: 'Eye', event: 'click', name: 'Poke eye', actions: [{ input: 'poke' }] });
    addListener(doc, { target: 'Letter', event: 'click', name: 'Poke letter', actions: [{ input: 'poke' }] });

    // light + dark themes
    doc.editor!.themes[0].name = 'Light';
    const dark = addTheme(doc, 'Dark');
    const id = (n: string) => doc.editor!.swatches.find((s) => s.name === n)!.id;
    setSwatchColor(doc, id('Background'), 0xff121316, dark.id);
    setSwatchColor(doc, id('Ink'), 0xfff5f5f2, dark.id);
    setSwatchColor(doc, id('Brand'), 0xff3d8bff, dark.id);
    setSwatchColor(doc, id('Glint'), 0xff121316, dark.id);
    applyTheme(doc, doc.editor!.themes[0].id);
    return doc;
  },
};

export const upstandLogo: Template = {
  id: 'upstand-logo',
  name: 'Upstand Logo',
  description: 'The Upstand app icon: the italic marks slide in, a shine sweeps across, then it floats. Hover lifts it, click replays.',
  learn: ['Vector paths', 'Clipping masks', 'Staggered timing', 'Any State transitions'],
  build() {
    const doc = base('Upstand Logo', 500, 500, '#0d1117');
    defineColor(doc, 'Brand', '#0068ff');
    defineColor(doc, 'Mark', '#ffffff');
    addShape(doc, { kind: 'rectangle', name: 'Tile', x: 250, y: 250, width: 400, height: 400, cornerRadius: 88 });
    applyThemeColor(doc, 'Tile', 'Brand');
    const ab = getArtboard(doc);
    const tile = getObject(doc, 'Tile').o;
    // marks traced from the 200×200 logo, positioned relative to its center and scaled ×2
    const mark = obj('Node', { name: 'Mark', parentId: tile.id, x: 0, y: 0, scaleX: 2, scaleY: 2 });
    insertObjects(ab, [mark]);
    const pts = (list: number[][]) => list.map(([x, y]) => ({ x: x - 100, y: y - 100 }));
    addPath(doc, {
      parent: 'Mark',
      name: 'T',
      points: pts([
        [46, 55],
        [162.5, 55],
        [162.5, 69.5],
        [95.7, 69.5],
        [49.3, 143.5],
        [31.7, 143.5],
        [78.2, 69.5],
        [37.8, 69.5],
      ]),
      closed: true,
    });
    addPath(doc, {
      parent: 'Mark',
      name: 'F',
      points: pts([
        [105, 90.5],
        [162.5, 90.5],
        [162.5, 105.5],
        [112, 105.5],
        [88.5, 143.5],
        [70.6, 143.5],
      ]),
      closed: true,
    });
    applyThemeColor(doc, 'T', 'Mark');
    applyThemeColor(doc, 'F', 'Mark');
    // a translucent shine, clipped to the tile
    const shineGroup = obj('Node', { name: 'Shine Group', parentId: tile.id, x: 0, y: 0 });
    insertObjects(ab, [shineGroup]);
    addPath(doc, {
      parent: 'Shine Group',
      name: 'Shine',
      x: -330,
      y: 0,
      points: [
        { x: -30, y: -260 },
        { x: 40, y: -260 },
        { x: -120, y: 260 },
        { x: -190, y: 260 },
      ],
      closed: true,
      fill: '#ffffff55',
    });
    // the clip source must not contain the clipped content (the runtime clips to every
    // shape under the source), so use a fill-less mask shape that follows the tile
    addShape(doc, { kind: 'rectangle', name: 'Tile Mask', parent: 'Tile', x: 0, y: 0, width: 400, height: 400, cornerRadius: 88, fill: null });
    addClip(doc, { object: 'Shine Group', source: 'Tile Mask' });

    // Intro: tile pops, marks slide in along their slant, shine sweeps
    addAnimation(doc, { name: 'Intro', duration: 1.4, loop: 'oneShot' });
    const k = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Intro', object, property, keys });
    for (const p of ['scaleX', 'scaleY'])
      k('Tile', p, [
        { frame: 0, value: 0.6, ease: 'easeOutBack' },
        { frame: 30, value: 1 },
      ]);
    k('Tile', 'rotationDegrees', [
      { frame: 0, value: -10, ease: 'easeOutBack' },
      { frame: 30, value: 0 },
    ]);
    k('Tile', 'opacity', [
      { frame: 0, value: 0, ease: 'easeOut' },
      { frame: 14, value: 1 },
    ]);
    for (const [name, start] of [
      ['T', 16],
      ['F', 26],
    ] as const) {
      k(name, 'x', [
        { frame: 0, value: -24 },
        { frame: start, value: -24, ease: 'easeOut' },
        { frame: start + 26, value: 0 },
      ]);
      k(name, 'y', [
        { frame: 0, value: 38 },
        { frame: start, value: 38, ease: 'easeOut' },
        { frame: start + 26, value: 0 },
      ]);
      k(name, 'opacity', [
        { frame: 0, value: 0 },
        { frame: start, value: 0, ease: 'easeOut' },
        { frame: start + 16, value: 1 },
      ]);
    }
    k('Shine', 'x', [
      { frame: 0, value: -330 },
      { frame: 50, value: -330, ease: 'easeInOut' },
      { frame: 84, value: 560 },
    ]);

    addAnimation(doc, { name: 'Float', duration: 2.4, loop: 'pingPong' });
    addKeyframes(doc, { animation: 'Float', object: 'Mark', property: 'y', keys: [{ frame: 0, value: 0 }, { frame: 144, value: -3 }] });

    addAnimation(doc, { name: 'Rest', duration: 0.3, loop: 'oneShot' });
    addAnimation(doc, { name: 'Lift', duration: 0.35, loop: 'oneShot' });
    for (const p of ['scaleX', 'scaleY']) {
      addKeyframes(doc, { animation: 'Rest', object: 'Shine Group', property: p, keys: [{ frame: 0, value: 1 }] });
      addKeyframes(doc, { animation: 'Rest', object: 'Mark', property: p, keys: [{ frame: 0, value: 2 }] });
      addKeyframes(doc, { animation: 'Lift', object: 'Mark', property: p, keys: [{ frame: 0, value: 2, ease: 'easeOutBack' }, { frame: 20, value: 2.12 }] });
    }

    addStateMachine(doc, { name: 'Upstand' });
    addInput(doc, { type: 'boolean', name: 'hover' });
    addInput(doc, { type: 'trigger', name: 'replay' });
    addState(doc, { animation: 'Intro', x: 200, y: 20 });
    addState(doc, { animation: 'Float', x: 380, y: 20 });
    addTransition(doc, { from: 'entry', to: 'Intro' });
    addTransition(doc, { from: 'Intro', to: 'Float', exitTimeMs: 1400, durationMs: 200 });
    addTransition(doc, { from: 'any', to: 'Intro', conditions: [{ input: 'replay' }] });
    addLayer(doc, 'Upstand', 'Hover');
    addState(doc, { layer: 'Hover', animation: 'Rest', x: 200, y: 20 });
    addState(doc, { layer: 'Hover', animation: 'Lift', x: 380, y: 20 });
    addTransition(doc, { layer: 'Hover', from: 'entry', to: 'Rest' });
    addTransition(doc, { layer: 'Hover', from: 'Rest', to: 'Lift', conditions: [{ input: 'hover', value: true }] });
    addTransition(doc, { layer: 'Hover', from: 'Lift', to: 'Rest', durationMs: 200, conditions: [{ input: 'hover', value: false }] });
    addListener(doc, { target: 'Tile', event: 'enter', name: 'Hover', actions: [{ input: 'hover', value: true }] });
    addListener(doc, { target: 'Tile', event: 'exit', name: 'Leave', actions: [{ input: 'hover', value: false }] });
    addListener(doc, { target: 'Tile', event: 'click', name: 'Replay', actions: [{ input: 'replay' }] });

    doc.editor!.themes[0].name = 'Blue';
    const mono = addTheme(doc, 'Mono');
    const id = (n: string) => doc.editor!.swatches.find((s) => s.name === n)!.id;
    setSwatchColor(doc, id('Brand'), 0xff111111, mono.id);
    setSwatchColor(doc, id('Background'), 0xfff2f2f2, mono.id);
    applyTheme(doc, doc.editor!.themes[0].id);
    return doc;
  },
};
