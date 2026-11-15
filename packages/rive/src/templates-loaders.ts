// Three production-ready interactive loader templates with distinct 2.5D/3D concepts.
import {
  addAnimation,
  addClip,
  addDistanceConstraint,
  addGroup,
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
} from './api';
import { RiveDoc } from './document';
import { newDoc, newLayer, obj, solidStroke } from './factory';
import { moveBefore } from './ops';
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

function addLayer(doc: RiveDoc, sm: string, name: string) {
  const ab = getArtboard(doc);
  const machine = ab.stateMachines.find((m) => m.props.name === sm)!;
  machine.children!.push(newLayer(name));
  return name;
}

function addIsoPlane(doc: RiveDoc, parent: string, prefix: string, y = 0, squash = 0.58, angleDeg = -45) {
  const scaleNode = addGroup(doc, { parent, name: `${prefix} Squash`, x: 0, y });
  scaleNode.props.scaleY = squash;
  const rotNode = addGroup(doc, { parent: `${prefix} Squash`, name: `${prefix} Plane`, x: 0, y: 0 });
  rotNode.props.rotation = (angleDeg * Math.PI) / 180;
  return rotNode.props.name as string;
}

// =============================================================================
// 1. 3D Gyroscope Quantum Loader (`quantum-gyro-loader`)
// =============================================================================
export const quantumGyroLoader: Template = {
  id: 'quantum-gyro-loader',
  name: '3D Gyroscope Loader',
  description: 'A 3D multi-axis gyroscope core with counter-rotating orbital plasma rings, breathing nucleus, cursor parallax, hover overdrive, and click burst.',
  learn: ['3D gyroscope ring illusion', 'Trim-path plasma arcs', 'Multi-depth cursor parallax', 'Hover overdrive & click burst'],
  build() {
    const doc = base('3D Gyroscope Loader', 500, 500, '#070b14');
    const ab = getArtboard(doc);

    defineColor(doc, 'Ring Track', '#1e293b');
    defineColor(doc, 'Core Outer', '#0284c7');
    defineColor(doc, 'Core Inner', '#00f0ff');
    defineColor(doc, 'Plasma Cyan', '#00f0ff');
    defineColor(doc, 'Plasma Violet', '#a855f7');
    defineColor(doc, 'Plasma Rose', '#ff4d8d');
    defineColor(doc, 'Specular', '#ffffff');

    addGroup(doc, { name: 'Gyro Anchor', x: 250, y: 250 });

    // 1. Deep Backdrop Aura & Shockwave (6% parallax)
    addGroup(doc, { name: 'Aura Parallax', x: 250, y: 250 });
    addDistanceConstraint(doc, { object: 'Aura Parallax', target: 'Gyro Anchor', distance: 0, strength: 0.94 });
    addGroup(doc, { parent: 'Aura Parallax', name: 'Aura Float', x: 0, y: 0 });

    addShape(doc, {
      parent: 'Aura Float',
      kind: 'ellipse',
      name: 'Ambient Glow',
      x: 0,
      y: 0,
      width: 340,
      height: 340,
      fill: '#00f0ff14',
    });
    addShape(doc, {
      parent: 'Aura Float',
      kind: 'ellipse',
      name: 'Outer Containment Ring',
      x: 0,
      y: 0,
      width: 296,
      height: 296,
      fill: null,
      stroke: '#38bdf822',
      strokeWidth: 2,
    });

    const shockwave = addShape(doc, {
      parent: 'Aura Float',
      kind: 'ellipse',
      name: 'Quantum Shockwave',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      fill: null,
      stroke: '#00f0ff',
      strokeWidth: 5,
    });
    shockwave.props.opacity = 0;
    applyThemeColor(doc, 'Quantum Shockwave', 'Plasma Cyan', 'Stroke');

    // 2. Outer Gyroscope Ring Platform (16% parallax)
    addGroup(doc, { name: 'Rings Parallax', x: 250, y: 250 });
    addDistanceConstraint(doc, { object: 'Rings Parallax', target: 'Gyro Anchor', distance: 0, strength: 0.84 });
    addGroup(doc, { parent: 'Rings Parallax', name: 'Rings Hover Scale', x: 0, y: 0 });

    // Ring A: tilted -32 deg
    const ringATilt = addGroup(doc, { parent: 'Rings Hover Scale', name: 'Ring A Tilt', x: 0, y: 0 });
    ringATilt.props.rotation = (-32 * Math.PI) / 180;
    const ringASquash = addGroup(doc, { parent: 'Ring A Tilt', name: 'Ring A Squash', x: 0, y: 0 });
    ringASquash.props.scaleY = 0.42;
    addGroup(doc, { parent: 'Ring A Squash', name: 'Ring A Spin', x: 0, y: 0 });

    addShape(doc, {
      parent: 'Ring A Spin',
      kind: 'ellipse',
      name: 'Ring A Track',
      x: 0,
      y: 0,
      width: 248,
      height: 248,
      fill: null,
      stroke: '#38bdf833',
      strokeWidth: 6,
    });
    const ringAArc = addShape(doc, {
      parent: 'Ring A Spin',
      kind: 'ellipse',
      name: 'Ring A Arc',
      x: 0,
      y: 0,
      width: 248,
      height: 248,
      fill: null,
    });
    const [raStroke, raSolid] = solidStroke(ringAArc.id, 0xff00f0ff, 8);
    raStroke.props.cap = 1;
    const raTrim = obj('TrimPath', {
      name: 'Ring A Trim',
      parentId: raStroke.id,
      start: 0,
      end: 0.35,
      offset: 0,
      modeValue: 1,
    });
    ab.objects.push(raStroke, raSolid, raTrim);
    applyThemeColor(doc, 'Ring A Arc', 'Plasma Cyan', 'Stroke');

    addShape(doc, {
      parent: 'Ring A Spin',
      kind: 'ellipse',
      name: 'Satellite A',
      x: 124,
      y: 0,
      width: 16,
      height: 16,
    });
    applyThemeColor(doc, 'Satellite A', 'Specular');

    // Ring B: tilted +32 deg
    const ringBTilt = addGroup(doc, { parent: 'Rings Hover Scale', name: 'Ring B Tilt', x: 0, y: 0 });
    ringBTilt.props.rotation = (32 * Math.PI) / 180;
    const ringBSquash = addGroup(doc, { parent: 'Ring B Tilt', name: 'Ring B Squash', x: 0, y: 0 });
    ringBSquash.props.scaleY = 0.42;
    addGroup(doc, { parent: 'Ring B Squash', name: 'Ring B Spin', x: 0, y: 0 });

    addShape(doc, {
      parent: 'Ring B Spin',
      kind: 'ellipse',
      name: 'Ring B Track',
      x: 0,
      y: 0,
      width: 212,
      height: 212,
      fill: null,
      stroke: '#a855f733',
      strokeWidth: 6,
    });
    const ringBArc = addShape(doc, {
      parent: 'Ring B Spin',
      kind: 'ellipse',
      name: 'Ring B Arc',
      x: 0,
      y: 0,
      width: 212,
      height: 212,
      fill: null,
    });
    const [rbStroke, rbSolid] = solidStroke(ringBArc.id, 0xffa855f7, 8);
    rbStroke.props.cap = 1;
    const rbTrim = obj('TrimPath', {
      name: 'Ring B Trim',
      parentId: rbStroke.id,
      start: 0,
      end: 0.32,
      offset: 0.25,
      modeValue: 1,
    });
    ab.objects.push(rbStroke, rbSolid, rbTrim);
    applyThemeColor(doc, 'Ring B Arc', 'Plasma Violet', 'Stroke');

    addShape(doc, {
      parent: 'Ring B Spin',
      kind: 'ellipse',
      name: 'Satellite B',
      x: -106,
      y: 0,
      width: 14,
      height: 14,
    });
    applyThemeColor(doc, 'Satellite B', 'Plasma Rose');

    // Ring C: Equatorial high-speed ring (tilted -6 deg, squashed 0.34)
    const ringCTilt = addGroup(doc, { parent: 'Rings Hover Scale', name: 'Ring C Tilt', x: 0, y: 0 });
    ringCTilt.props.rotation = (-6 * Math.PI) / 180;
    const ringCSquash = addGroup(doc, { parent: 'Ring C Tilt', name: 'Ring C Squash', x: 0, y: 0 });
    ringCSquash.props.scaleY = 0.34;
    addGroup(doc, { parent: 'Ring C Squash', name: 'Ring C Spin', x: 0, y: 0 });

    addShape(doc, {
      parent: 'Ring C Spin',
      kind: 'ellipse',
      name: 'Ring C Track',
      x: 0,
      y: 0,
      width: 276,
      height: 276,
      fill: null,
      stroke: '#ff4d8d33',
      strokeWidth: 5,
    });
    const ringCArc = addShape(doc, {
      parent: 'Ring C Spin',
      kind: 'ellipse',
      name: 'Ring C Arc',
      x: 0,
      y: 0,
      width: 276,
      height: 276,
      fill: null,
    });
    const [rcStroke, rcSolid] = solidStroke(ringCArc.id, 0xffff4d8d, 7);
    rcStroke.props.cap = 1;
    const rcTrim = obj('TrimPath', {
      name: 'Ring C Trim',
      parentId: rcStroke.id,
      start: 0,
      end: 0.28,
      offset: 0.5,
      modeValue: 1,
    });
    ab.objects.push(rcStroke, rcSolid, rcTrim);
    applyThemeColor(doc, 'Ring C Arc', 'Plasma Rose', 'Stroke');

    addShape(doc, {
      parent: 'Ring C Spin',
      kind: 'ellipse',
      name: 'Satellite C',
      x: 0,
      y: 138,
      width: 13,
      height: 13,
    });
    applyThemeColor(doc, 'Satellite C', 'Plasma Cyan');

    // 3. Central Quantum Nucleus (28% parallax)
    addGroup(doc, { name: 'Core Parallax', x: 250, y: 250 });
    addDistanceConstraint(doc, { object: 'Core Parallax', target: 'Gyro Anchor', distance: 0, strength: 0.72 });
    addGroup(doc, { parent: 'Core Parallax', name: 'Core Pulse', x: 0, y: 0 });
    addGroup(doc, { parent: 'Core Pulse', name: 'Core Burst', x: 0, y: 0 });

    addShape(doc, {
      parent: 'Core Burst',
      kind: 'ellipse',
      name: 'Core Halo',
      x: 0,
      y: 0,
      width: 96,
      height: 96,
      fill: '#00f0ff2b',
    });
    addShape(doc, {
      parent: 'Core Burst',
      kind: 'ellipse',
      name: 'Core Sphere',
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      stroke: '#ffffff66',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Core Sphere', 'Core Outer');

    addShape(doc, {
      parent: 'Core Burst',
      kind: 'ellipse',
      name: 'Core Nucleus',
      x: 0,
      y: 0,
      width: 38,
      height: 38,
    });
    applyThemeColor(doc, 'Core Nucleus', 'Core Inner');

    addShape(doc, {
      parent: 'Core Burst',
      kind: 'star',
      name: 'Core Star',
      x: 0,
      y: 0,
      width: 26,
      height: 26,
      points: 4,
      innerRadius: 0.35,
    });
    applyThemeColor(doc, 'Core Star', 'Specular');

    // 4. Specular Highlight Layer (38% parallax for 3D sphere depth)
    addGroup(doc, { name: 'Glint Parallax', x: 250, y: 250 });
    addDistanceConstraint(doc, { object: 'Glint Parallax', target: 'Gyro Anchor', distance: 0, strength: 0.62 });
    addShape(doc, {
      parent: 'Glint Parallax',
      kind: 'ellipse',
      name: 'Core Glint',
      x: -10,
      y: -12,
      width: 12,
      height: 12,
    });
    applyThemeColor(doc, 'Core Glint', 'Specular');

    // -------------------------------------------------------------------------
    // Timelines
    // -------------------------------------------------------------------------
    addAnimation(doc, { name: 'Orbit', duration: 2.4, loop: 'loop' });
    const ko = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Orbit', object, property, keys });

    ko('Ring A Spin', 'rotationDegrees', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 144, value: 360 },
    ]);
    ko('Ring B Spin', 'rotationDegrees', [
      { frame: 0, value: 360, ease: 'linear' },
      { frame: 144, value: 0 },
    ]);
    ko('Ring C Spin', 'rotationDegrees', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 144, value: 720 },
    ]);

    // 3D Gyroscope plane precession (oscillating squash & tilt)
    ko('Ring A Squash', 'scaleY', [
      { frame: 0, value: 0.42, ease: 'easeInOut' },
      { frame: 72, value: 0.68, ease: 'easeInOut' },
      { frame: 144, value: 0.42 },
    ]);
    ko('Ring B Squash', 'scaleY', [
      { frame: 0, value: 0.68, ease: 'easeInOut' },
      { frame: 72, value: 0.36, ease: 'easeInOut' },
      { frame: 144, value: 0.68 },
    ]);
    ko('Ring A Tilt', 'rotationDegrees', [
      { frame: 0, value: -32, ease: 'easeInOut' },
      { frame: 72, value: -20, ease: 'easeInOut' },
      { frame: 144, value: -32 },
    ]);
    ko('Ring B Tilt', 'rotationDegrees', [
      { frame: 0, value: 32, ease: 'easeInOut' },
      { frame: 72, value: 20, ease: 'easeInOut' },
      { frame: 144, value: 32 },
    ]);
    ko('Ring C Squash', 'scaleY', [
      { frame: 0, value: 0.34, ease: 'easeInOut' },
      { frame: 72, value: 0.48, ease: 'easeInOut' },
      { frame: 144, value: 0.34 },
    ]);
    ko('Ring C Tilt', 'rotationDegrees', [
      { frame: 0, value: -6, ease: 'easeInOut' },
      { frame: 72, value: 8, ease: 'easeInOut' },
      { frame: 144, value: -6 },
    ]);

    // Core breathing & star spin
    for (const s of ['scaleX', 'scaleY'] as const) {
      ko('Core Pulse', s, [
        { frame: 0, value: 0.92, ease: 'easeInOut' },
        { frame: 72, value: 1.12, ease: 'easeInOut' },
        { frame: 144, value: 0.92 },
      ]);
      ko('Ambient Glow', s, [
        { frame: 0, value: 0.9, ease: 'easeInOut' },
        { frame: 72, value: 1.1, ease: 'easeInOut' },
        { frame: 144, value: 0.9 },
      ]);
    }
    ko('Core Star', 'rotationDegrees', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 144, value: -360 },
    ]);

    // Hover Layer: Normal vs. Overdrive
    addAnimation(doc, { name: 'Normal', duration: 0.25, loop: 'oneShot' });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Normal', object: 'Rings Hover Scale', property: s, keys: [{ frame: 0, value: 1 }] });
      addKeyframes(doc, { animation: 'Normal', object: 'Outer Containment Ring', property: s, keys: [{ frame: 0, value: 1 }] });
    }
    addKeyframes(doc, { animation: 'Normal', object: 'Ring A Trim', property: 'end', keys: [{ frame: 0, value: 0.35 }] });
    addKeyframes(doc, { animation: 'Normal', object: 'Ring B Trim', property: 'end', keys: [{ frame: 0, value: 0.32 }] });

    addAnimation(doc, { name: 'Overdrive', duration: 0.35, loop: 'oneShot' });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Overdrive',
        object: 'Rings Hover Scale',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 21, value: 1.12 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Overdrive',
        object: 'Outer Containment Ring',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 21, value: 1.08 },
        ],
      });
    }
    addKeyframes(doc, {
      animation: 'Overdrive',
      object: 'Ring A Trim',
      property: 'end',
      keys: [
        { frame: 0, value: 0.35, ease: 'easeOut' },
        { frame: 21, value: 0.68 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Overdrive',
      object: 'Ring B Trim',
      property: 'end',
      keys: [
        { frame: 0, value: 0.32, ease: 'easeOut' },
        { frame: 21, value: 0.65 },
      ],
    });

    // Click Layer: Burst Idle vs. Quantum Burst
    addAnimation(doc, { name: 'Burst Idle', duration: 0.1, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Burst Idle', object: 'Quantum Shockwave', property: 'opacity', keys: [{ frame: 0, value: 0 }] });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Burst Idle', object: 'Quantum Shockwave', property: s, keys: [{ frame: 0, value: 0.5 }] });
      addKeyframes(doc, { animation: 'Burst Idle', object: 'Core Burst', property: s, keys: [{ frame: 0, value: 1 }] });
    }

    addAnimation(doc, { name: 'Quantum Burst', duration: 0.65, loop: 'oneShot' });
    addKeyframes(doc, {
      animation: 'Quantum Burst',
      object: 'Quantum Shockwave',
      property: 'opacity',
      keys: [
        { frame: 0, value: 1, ease: 'easeOut' },
        { frame: 39, value: 0 },
      ],
    });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Quantum Burst',
        object: 'Quantum Shockwave',
        property: s,
        keys: [
          { frame: 0, value: 0.45, ease: 'easeOut' },
          { frame: 39, value: 1.95 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Quantum Burst',
        object: 'Core Burst',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOut' },
          { frame: 7, value: 0.72, ease: 'easeOutBack' },
          { frame: 22, value: 1.42, ease: 'easeInOut' },
          { frame: 39, value: 1 },
        ],
      });
    }

    // State Machine
    addStateMachine(doc, { name: 'Quantum Gyro' });
    addInput(doc, { type: 'boolean', name: 'isHovered' });
    addInput(doc, { type: 'trigger', name: 'burst' });

    const machine = ab.stateMachines[0];
    machine.children!.find((c) => c.type === 'StateMachineLayer')!.props.name = 'Orbit';
    addState(doc, { layer: 'Orbit', animation: 'Orbit', x: 200, y: 20 });
    addTransition(doc, { layer: 'Orbit', from: 'entry', to: 'Orbit' });

    addLayer(doc, 'Quantum Gyro', 'Hover');
    addState(doc, { layer: 'Hover', animation: 'Normal', x: 180, y: 20 });
    addState(doc, { layer: 'Hover', animation: 'Overdrive', x: 380, y: 20 });
    addTransition(doc, { layer: 'Hover', from: 'entry', to: 'Normal' });
    addTransition(doc, { layer: 'Hover', from: 'Normal', to: 'Overdrive', durationMs: 200, conditions: [{ input: 'isHovered', value: true }] });
    addTransition(doc, { layer: 'Hover', from: 'Overdrive', to: 'Normal', durationMs: 240, conditions: [{ input: 'isHovered', value: false }] });

    addLayer(doc, 'Quantum Gyro', 'Click');
    addState(doc, { layer: 'Click', animation: 'Burst Idle', x: 180, y: 20 });
    addState(doc, { layer: 'Click', animation: 'Quantum Burst', x: 380, y: 20 });
    addTransition(doc, { layer: 'Click', from: 'entry', to: 'Burst Idle' });
    addTransition(doc, { layer: 'Click', from: 'any', to: 'Quantum Burst', conditions: [{ input: 'burst' }] });
    addTransition(doc, { layer: 'Click', from: 'Quantum Burst', to: 'Burst Idle', exitTimeMs: 650, durationMs: 100 });

    const hit = addShape(doc, { kind: 'rectangle', name: 'Hit Area', x: 250, y: 250, width: 500, height: 500, fill: '#ffffff00' });
    moveBefore(ab, hit.id, null, ab.artboard.id);

    addListener(doc, {
      target: 'Hit Area',
      event: 'move',
      name: 'Tilt Gyro',
      actions: [
        { alignTarget: 'Aura Parallax' },
        { alignTarget: 'Rings Parallax' },
        { alignTarget: 'Core Parallax' },
        { alignTarget: 'Glint Parallax' },
      ],
    });
    addListener(doc, { target: 'Hit Area', event: 'enter', name: 'Enter Overdrive', actions: [{ input: 'isHovered', value: true }] });
    addListener(doc, { target: 'Hit Area', event: 'exit', name: 'Exit Overdrive', actions: [{ input: 'isHovered', value: false }] });
    addListener(doc, { target: 'Hit Area', event: 'click', name: 'Trigger Burst', actions: [{ input: 'burst' }] });

    doc.editor!.themes[0].name = 'Quantum Cyan';
    const solar = addTheme(doc, 'Solar Gold');
    const swatchId = (n: string) => doc.editor!.swatches.find((s) => s.name === n)!.id;
    setSwatchColor(doc, swatchId('Background'), 0xfff8fafc, solar.id);
    setSwatchColor(doc, swatchId('Ring Track'), 0xffcbd5e1, solar.id);
    setSwatchColor(doc, swatchId('Core Outer'), 0xffea580c, solar.id);
    setSwatchColor(doc, swatchId('Core Inner'), 0xfffbbf24, solar.id);
    setSwatchColor(doc, swatchId('Plasma Cyan'), 0xff0284c7, solar.id);
    setSwatchColor(doc, swatchId('Plasma Violet'), 0xff7c3aed, solar.id);
    setSwatchColor(doc, swatchId('Plasma Rose'), 0xffe11d48, solar.id);
    setSwatchColor(doc, swatchId('Specular'), 0xffffffff, solar.id);
    applyTheme(doc, doc.editor!.themes[0].id);

    return doc;
  },
};

// =============================================================================
// 2. 3D Isometric Cube Matrix Loader (`cube-matrix-loader`)
// =============================================================================
export const cubeMatrixLoader: Template = {
  id: 'cube-matrix-loader',
  name: '3D Cube Matrix Loader',
  description: 'A 3×3 grid of extruded 2.5D isometric cubes rippling in a diagonal harmonic wave with cursor parallax, hover elevation, and click cascade.',
  learn: ['Isometric 3×3 grid ordering', 'Phase-staggered harmonic wave', 'Extruded 2.5D bevels', 'Interactive elevation & shockwave'],
  build() {
    const doc = base('3D Cube Matrix Loader', 500, 500, '#090b14');
    const ab = getArtboard(doc);

    defineColor(doc, 'Platform Base', '#121829');
    defineColor(doc, 'Platform Side', '#080c17');
    defineColor(doc, 'Cube Top', '#2563eb');
    defineColor(doc, 'Cube Accent', '#00e5bb');
    defineColor(doc, 'Cube Highlight', '#a855f7');
    defineColor(doc, 'Cube Side', '#172038');
    defineColor(doc, 'Rim', '#60a5fa');
    defineColor(doc, 'Core Dot', '#ffffff');

    addGroup(doc, { name: 'Matrix Anchor', x: 250, y: 255 });

    // 1. Platform Shadow & Base Pedestal (7% parallax)
    addGroup(doc, { name: 'Pedestal Parallax', x: 250, y: 255 });
    addDistanceConstraint(doc, { object: 'Pedestal Parallax', target: 'Matrix Anchor', distance: 0, strength: 0.93 });
    addGroup(doc, { parent: 'Pedestal Parallax', name: 'Pedestal Float', x: 0, y: 28 });

    addShape(doc, {
      parent: 'Pedestal Float',
      kind: 'ellipse',
      name: 'Matrix Ambient Glow',
      x: 0,
      y: 6,
      width: 380,
      height: 220,
      fill: '#3b82f61a',
    });

    const platBevel = addIsoPlane(doc, 'Pedestal Float', 'Platform Bevel', 14);
    addShape(doc, {
      parent: platBevel,
      kind: 'rectangle',
      name: 'Platform Bevel',
      x: 0,
      y: 0,
      width: 248,
      height: 248,
      cornerRadius: 28,
      stroke: '#3b82f644',
      strokeWidth: 1.5,
    });
    applyThemeColor(doc, 'Platform Bevel', 'Platform Side');

    const platTop = addIsoPlane(doc, 'Pedestal Float', 'Platform Top', 0);
    addShape(doc, {
      parent: platTop,
      kind: 'rectangle',
      name: 'Platform Top',
      x: 0,
      y: 0,
      width: 248,
      height: 248,
      cornerRadius: 28,
      stroke: '#3b82f666',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Platform Top', 'Platform Base');

    const platTrace = addShape(doc, {
      parent: platTop,
      kind: 'rectangle',
      name: 'Platform Trace',
      x: 0,
      y: 0,
      width: 228,
      height: 228,
      cornerRadius: 22,
      fill: null,
    });
    const [ptStroke, ptSolid] = solidStroke(platTrace.id, 0xff00e5bb, 3);
    ptStroke.props.cap = 1;
    const ptTrim = obj('TrimPath', {
      name: 'Platform Trace Trim',
      parentId: ptStroke.id,
      start: 0,
      end: 0.25,
      offset: 0,
      modeValue: 1,
    });
    ab.objects.push(ptStroke, ptSolid, ptTrim);
    applyThemeColor(doc, 'Platform Trace', 'Cube Accent', 'Stroke');

    // Isometric shockwave ring on click
    const shockPlane = addIsoPlane(doc, 'Pedestal Float', 'Matrix Shockwave', -6);
    const matrixWave = addShape(doc, {
      parent: shockPlane,
      kind: 'rectangle',
      name: 'Matrix Shockwave',
      x: 0,
      y: 0,
      width: 230,
      height: 230,
      cornerRadius: 26,
      fill: null,
      stroke: '#00e5bb',
      strokeWidth: 4,
    });
    matrixWave.props.opacity = 0;
    applyThemeColor(doc, 'Matrix Shockwave', 'Cube Accent', 'Stroke');

    // 2. 3x3 Isometric Cube Grid (20% parallax)
    // True symmetric isometric projection (angle=-45 deg, squash=0.58):
    //   screenX = 0.7071 * (gx + gy)
    //   screenY = 0.58 * 0.7071 * (gy - gx)
    // Order cells from back (lowest screenY) to front (highest screenY) so front cubes draw on top!
    addGroup(doc, { name: 'Cubes Parallax', x: 250, y: 255 });
    addDistanceConstraint(doc, { object: 'Cubes Parallax', target: 'Matrix Anchor', distance: 0, strength: 0.80 });
    addGroup(doc, { parent: 'Cubes Parallax', name: 'Matrix Hover Lift', x: 0, y: -4 });
    addGroup(doc, { parent: 'Matrix Hover Lift', name: 'Matrix Click Bounce', x: 0, y: 0 });

    const step = 62;
    const rawCells: { row: number; col: number; sx: number; sy: number; diag: number }[] = [];
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        const gx = c * step;
        const gy = r * step;
        const sx = Math.round(0.7071068 * (gx + gy) * 10) / 10;
        const sy = Math.round(0.58 * 0.7071068 * (gy - gx) * 10) / 10;
        rawCells.push({ row: r + 1, col: c + 1, sx, sy, diag: r + 1 + (1 - c) });
      }
    }
    rawCells.sort((a, b) => a.sy - b.sy);

    for (const cell of rawCells) {
      const id = `${cell.row + 1}-${cell.col + 1}`;
      const isCenter = cell.row === 1 && cell.col === 1;
      const isCorner = (cell.row === 0 || cell.row === 2) && (cell.col === 0 || cell.col === 2);
      const topSwatch = isCenter ? 'Cube Accent' : isCorner ? 'Cube Highlight' : 'Cube Top';

      addGroup(doc, {
        parent: 'Matrix Click Bounce',
        name: `Cube ${id}`,
        x: cell.sx,
        y: cell.sy,
      });

      // Lower 3D extrusion pillar
      const sideLower = addIsoPlane(doc, `Cube ${id}`, `Cube ${id} Pillar`, 18);
      addShape(doc, {
        parent: sideLower,
        kind: 'rectangle',
        name: `Cube ${id} Pillar`,
        x: 0,
        y: 0,
        width: 48,
        height: 48,
        cornerRadius: 11,
      });
      applyThemeColor(doc, `Cube ${id} Pillar`, 'Platform Side');

      // Mid 3D bevel
      const sideMid = addIsoPlane(doc, `Cube ${id}`, `Cube ${id} Side`, 9);
      addShape(doc, {
        parent: sideMid,
        kind: 'rectangle',
        name: `Cube ${id} Side`,
        x: 0,
        y: 0,
        width: 48,
        height: 48,
        cornerRadius: 11,
        stroke: '#60a5fa44',
        strokeWidth: 1.5,
      });
      applyThemeColor(doc, `Cube ${id} Side`, 'Cube Side');

      // Top face
      const topPlane = addIsoPlane(doc, `Cube ${id}`, `Cube ${id} Top`, 0);
      addShape(doc, {
        parent: topPlane,
        kind: 'rectangle',
        name: `Cube ${id} Top`,
        x: 0,
        y: 0,
        width: 48,
        height: 48,
        cornerRadius: 11,
        stroke: '#ffffff66',
        strokeWidth: 1.5,
      });
      applyThemeColor(doc, `Cube ${id} Top`, topSwatch);

      // Glowing indicator dot on top face
      addShape(doc, {
        parent: topPlane,
        kind: 'ellipse',
        name: `Cube ${id} Dot`,
        x: 0,
        y: 0,
        width: isCenter ? 14 : 9,
        height: isCenter ? 14 : 9,
      });
      applyThemeColor(doc, `Cube ${id} Dot`, 'Core Dot');
    }

    // -------------------------------------------------------------------------
    // Timelines
    // -------------------------------------------------------------------------
    // 1. Wave: diagonal harmonic ripple across all 9 cubes
    addAnimation(doc, { name: 'Wave', duration: 1.8, loop: 'loop' });
    const kw = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Wave', object, property, keys });

    for (const cell of rawCells) {
      const id = `${cell.row + 1}-${cell.col + 1}`;
      // Stagger peak frame by diagonal index (0..4)
      const peakFrame = 14 + cell.diag * 16;
      const baseY = cell.sy;
      const liftY = cell.sy - 28;

      kw(`Cube ${id}`, 'y', [
        { frame: 0, value: baseY, ease: 'easeInOut' },
        { frame: Math.max(4, peakFrame - 24), value: baseY, ease: 'easeInOut' },
        { frame: peakFrame, value: liftY, ease: 'easeInOut' },
        { frame: Math.min(104, peakFrame + 26), value: baseY, ease: 'easeInOut' },
        { frame: 108, value: baseY },
      ]);
      for (const s of ['scaleX', 'scaleY'] as const) {
        kw(`Cube ${id}`, s, [
          { frame: 0, value: 1, ease: 'easeInOut' },
          { frame: Math.max(4, peakFrame - 24), value: 0.94, ease: 'easeOutBack' },
          { frame: peakFrame, value: 1.12, ease: 'easeInOut' },
          { frame: Math.min(104, peakFrame + 26), value: 1, ease: 'easeInOut' },
          { frame: 108, value: 1 },
        ]);
      }
    }

    kw('Platform Trace Trim', 'offset', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: 108, value: 1 },
    ]);

    // 2. Hover Layer: Rest vs. Elevate
    addAnimation(doc, { name: 'Rest', duration: 0.25, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Rest', object: 'Matrix Hover Lift', property: 'y', keys: [{ frame: 0, value: -4 }] });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Rest', object: 'Matrix Hover Lift', property: s, keys: [{ frame: 0, value: 1 }] });
    }

    addAnimation(doc, { name: 'Elevate', duration: 0.35, loop: 'oneShot' });
    addKeyframes(doc, {
      animation: 'Elevate',
      object: 'Matrix Hover Lift',
      property: 'y',
      keys: [
        { frame: 0, value: -4, ease: 'easeOutBack' },
        { frame: 21, value: -24 },
      ],
    });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Elevate',
        object: 'Matrix Hover Lift',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 21, value: 1.07 },
        ],
      });
    }

    // 3. Click Layer: Cascade Idle vs. Cascade Jump
    addAnimation(doc, { name: 'Cascade Idle', duration: 0.1, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Cascade Idle', object: 'Matrix Click Bounce', property: 'y', keys: [{ frame: 0, value: 0 }] });
    addKeyframes(doc, { animation: 'Cascade Idle', object: 'Matrix Shockwave', property: 'opacity', keys: [{ frame: 0, value: 0 }] });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Cascade Idle', object: 'Matrix Shockwave', property: s, keys: [{ frame: 0, value: 0.5 }] });
    }

    addAnimation(doc, { name: 'Cascade Jump', duration: 0.65, loop: 'oneShot' });
    addKeyframes(doc, {
      animation: 'Cascade Jump',
      object: 'Matrix Click Bounce',
      property: 'y',
      keys: [
        { frame: 0, value: 0, ease: 'easeOut' },
        { frame: 7, value: 14, ease: 'easeOutBack' },
        { frame: 22, value: -24, ease: 'easeInOut' },
        { frame: 39, value: 0 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Cascade Jump',
      object: 'Matrix Shockwave',
      property: 'opacity',
      keys: [
        { frame: 0, value: 1, ease: 'easeOut' },
        { frame: 39, value: 0 },
      ],
    });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Cascade Jump',
        object: 'Matrix Shockwave',
        property: s,
        keys: [
          { frame: 0, value: 0.55, ease: 'easeOut' },
          { frame: 39, value: 1.75 },
        ],
      });
    }

    // State Machine
    addStateMachine(doc, { name: 'Cube Matrix' });
    addInput(doc, { type: 'boolean', name: 'isHovered' });
    addInput(doc, { type: 'trigger', name: 'pulse' });

    const machine = ab.stateMachines[0];
    machine.children!.find((c) => c.type === 'StateMachineLayer')!.props.name = 'Wave';
    addState(doc, { layer: 'Wave', animation: 'Wave', x: 200, y: 20 });
    addTransition(doc, { layer: 'Wave', from: 'entry', to: 'Wave' });

    addLayer(doc, 'Cube Matrix', 'Hover');
    addState(doc, { layer: 'Hover', animation: 'Rest', x: 180, y: 20 });
    addState(doc, { layer: 'Hover', animation: 'Elevate', x: 380, y: 20 });
    addTransition(doc, { layer: 'Hover', from: 'entry', to: 'Rest' });
    addTransition(doc, { layer: 'Hover', from: 'Rest', to: 'Elevate', durationMs: 200, conditions: [{ input: 'isHovered', value: true }] });
    addTransition(doc, { layer: 'Hover', from: 'Elevate', to: 'Rest', durationMs: 240, conditions: [{ input: 'isHovered', value: false }] });

    addLayer(doc, 'Cube Matrix', 'Click');
    addState(doc, { layer: 'Click', animation: 'Cascade Idle', x: 180, y: 20 });
    addState(doc, { layer: 'Click', animation: 'Cascade Jump', x: 380, y: 20 });
    addTransition(doc, { layer: 'Click', from: 'entry', to: 'Cascade Idle' });
    addTransition(doc, { layer: 'Click', from: 'any', to: 'Cascade Jump', conditions: [{ input: 'pulse' }] });
    addTransition(doc, { layer: 'Click', from: 'Cascade Jump', to: 'Cascade Idle', exitTimeMs: 650, durationMs: 100 });

    const hit = addShape(doc, { kind: 'rectangle', name: 'Hit Area', x: 250, y: 250, width: 500, height: 500, fill: '#ffffff00' });
    moveBefore(ab, hit.id, null, ab.artboard.id);

    addListener(doc, {
      target: 'Hit Area',
      event: 'move',
      name: 'Parallax Matrix',
      actions: [{ alignTarget: 'Pedestal Parallax' }, { alignTarget: 'Cubes Parallax' }],
    });
    addListener(doc, { target: 'Hit Area', event: 'enter', name: 'Elevate Matrix', actions: [{ input: 'isHovered', value: true }] });
    addListener(doc, { target: 'Hit Area', event: 'exit', name: 'Lower Matrix', actions: [{ input: 'isHovered', value: false }] });
    addListener(doc, { target: 'Hit Area', event: 'click', name: 'Pulse Matrix', actions: [{ input: 'pulse' }] });

    doc.editor!.themes[0].name = 'Neon Matrix';
    const studio = addTheme(doc, 'Clean Studio');
    const swatchId = (n: string) => doc.editor!.swatches.find((s) => s.name === n)!.id;
    setSwatchColor(doc, swatchId('Background'), 0xfff1f5f9, studio.id);
    setSwatchColor(doc, swatchId('Platform Base'), 0xffffffff, studio.id);
    setSwatchColor(doc, swatchId('Platform Side'), 0xffcbd5e1, studio.id);
    setSwatchColor(doc, swatchId('Cube Top'), 0xff2563eb, studio.id);
    setSwatchColor(doc, swatchId('Cube Accent'), 0xff059669, studio.id);
    setSwatchColor(doc, swatchId('Cube Highlight'), 0xff7c3aed, studio.id);
    setSwatchColor(doc, swatchId('Cube Side'), 0xff1e293b, studio.id);
    setSwatchColor(doc, swatchId('Rim'), 0xff3b82f6, studio.id);
    setSwatchColor(doc, swatchId('Core Dot'), 0xffffffff, studio.id);
    applyTheme(doc, doc.editor!.themes[0].id);

    return doc;
  },
};

// =============================================================================
// 3. Fluid Helix & Equalizer Capsule Loader (`infinity-pulse-loader`)
// =============================================================================
export const infinityPulseLoader: Template = {
  id: 'infinity-pulse-loader',
  name: 'Fluid Helix Capsule Loader',
  description: 'A glassmorphic loader dock with 9 phase-shifted fluid equalizer bars, weaving helix orbs, clipped sheen reflection, and sonic burst.',
  learn: ['Phase-shifted harmonic waves', 'Glassmorphic clipped sheen', 'Trim-path orbital track', 'Interactive turbo state'],
  build() {
    const doc = base('Fluid Helix Capsule Loader', 500, 500, '#080e16');
    const ab = getArtboard(doc);

    defineColor(doc, 'Dock Fill', '#111c2d');
    defineColor(doc, 'Dock Bevel', '#060a12');
    defineColor(doc, 'Well Fill', '#0a111d');
    defineColor(doc, 'Wave Cyan', '#00f0ff');
    defineColor(doc, 'Wave Mint', '#00e5a3');
    defineColor(doc, 'Wave Blue', '#3b82f6');
    defineColor(doc, 'Wave Rose', '#ff4d8d');
    defineColor(doc, 'Orbital', '#a855f7');
    defineColor(doc, 'Ink', '#ffffff');

    addGroup(doc, { name: 'Dock Anchor', x: 250, y: 250 });

    // 1. Ambient Backdrop & Sonic Ring (6% parallax)
    addGroup(doc, { name: 'Backdrop Parallax', x: 250, y: 250 });
    addDistanceConstraint(doc, { object: 'Backdrop Parallax', target: 'Dock Anchor', distance: 0, strength: 0.94 });

    addShape(doc, {
      parent: 'Backdrop Parallax',
      kind: 'ellipse',
      name: 'Backdrop Glow',
      x: 0,
      y: 0,
      width: 380,
      height: 240,
      fill: '#00e5a318',
    });

    const sonicRing = addShape(doc, {
      parent: 'Backdrop Parallax',
      kind: 'rectangle',
      name: 'Sonic Shockwave',
      x: 0,
      y: 0,
      width: 350,
      height: 180,
      cornerRadius: 90,
      fill: null,
      stroke: '#00f0ff',
      strokeWidth: 4,
    });
    sonicRing.props.opacity = 0;
    applyThemeColor(doc, 'Sonic Shockwave', 'Wave Cyan', 'Stroke');

    // 2. Glassmorphic Capsule Dock (16% parallax)
    addGroup(doc, { name: 'Dock Parallax', x: 250, y: 250 });
    addDistanceConstraint(doc, { object: 'Dock Parallax', target: 'Dock Anchor', distance: 0, strength: 0.84 });
    addGroup(doc, { parent: 'Dock Parallax', name: 'Dock Hover Scale', x: 0, y: 0 });
    addGroup(doc, { parent: 'Dock Hover Scale', name: 'Dock Click Pop', x: 0, y: 0 });

    addShape(doc, {
      parent: 'Dock Click Pop',
      kind: 'rectangle',
      name: 'Dock Shadow',
      x: 0,
      y: 18,
      width: 348,
      height: 174,
      cornerRadius: 87,
      fill: '#00000077',
    });
    addShape(doc, {
      parent: 'Dock Click Pop',
      kind: 'rectangle',
      name: 'Dock Bevel',
      x: 0,
      y: 8,
      width: 344,
      height: 168,
      cornerRadius: 84,
    });
    applyThemeColor(doc, 'Dock Bevel', 'Dock Bevel');

    addShape(doc, {
      parent: 'Dock Click Pop',
      kind: 'rectangle',
      name: 'Dock Shell',
      x: 0,
      y: 0,
      width: 344,
      height: 168,
      cornerRadius: 84,
      stroke: '#00f0ff55',
      strokeWidth: 2,
    });
    applyThemeColor(doc, 'Dock Shell', 'Dock Fill');

    // Chasing perimeter energy comet around the capsule dock
    const dockPerimeter = addShape(doc, {
      parent: 'Dock Click Pop',
      kind: 'rectangle',
      name: 'Dock Perimeter Comet',
      x: 0,
      y: 0,
      width: 344,
      height: 168,
      cornerRadius: 84,
      fill: null,
    });
    const [dpStroke, dpSolid] = solidStroke(dockPerimeter.id, 0xff00e5a3, 4);
    dpStroke.props.cap = 1;
    const dpTrim = obj('TrimPath', {
      name: 'Dock Comet Trim',
      parentId: dpStroke.id,
      start: 0,
      end: 0.24,
      offset: 0,
      modeValue: 1,
    });
    ab.objects.push(dpStroke, dpSolid, dpTrim);
    applyThemeColor(doc, 'Dock Perimeter Comet', 'Wave Mint', 'Stroke');

    // Inner recessed wave chamber
    addShape(doc, {
      parent: 'Dock Click Pop',
      kind: 'rectangle',
      name: 'Wave Chamber',
      x: 0,
      y: 0,
      width: 304,
      height: 128,
      cornerRadius: 64,
    });
    applyThemeColor(doc, 'Wave Chamber', 'Well Fill');

    // Clipped diagonal glass sheen across the dock
    addGroup(doc, { parent: 'Dock Click Pop', name: 'Glass Sheen Group', x: 0, y: 0 });
    addPath(doc, {
      parent: 'Glass Sheen Group',
      name: 'Glass Sheen',
      x: -220,
      y: 0,
      closed: true,
      fill: '#ffffff24',
      points: [
        { x: -24, y: -100 },
        { x: 24, y: -100 },
        { x: -46, y: 100 },
        { x: -94, y: 100 },
      ],
    });
    addShape(doc, {
      parent: 'Dock Click Pop',
      kind: 'rectangle',
      name: 'Dock Mask',
      x: 0,
      y: 0,
      width: 344,
      height: 168,
      cornerRadius: 84,
      fill: null,
    });
    addClip(doc, { object: 'Glass Sheen Group', source: 'Dock Mask' });

    // 3. Fluid Equalizer Bars & Double-Helix Orbs (28% parallax)
    addGroup(doc, { name: 'Wave Parallax', x: 250, y: 250 });
    addDistanceConstraint(doc, { object: 'Wave Parallax', target: 'Dock Anchor', distance: 0, strength: 0.72 });
    addGroup(doc, { parent: 'Wave Parallax', name: 'Wave Amplitude', x: 0, y: 0 });

    const barColors = [
      'Wave Blue',
      'Wave Cyan',
      'Wave Mint',
      'Wave Cyan',
      'Wave Rose',
      'Wave Cyan',
      'Wave Mint',
      'Wave Cyan',
      'Wave Blue',
    ] as const;

    for (let i = 0; i < 9; i++) {
      const bx = (i - 4) * 28;
      const bName = `Fluid Bar ${i + 1}`;
      addShape(doc, {
        parent: 'Wave Amplitude',
        kind: 'rectangle',
        name: bName,
        x: bx,
        y: 0,
        width: 14,
        height: 68,
        cornerRadius: 7,
      });
      applyThemeColor(doc, bName, barColors[i]);

      // Companion helix node weaving across the bars
      const dotName = `Helix Dot ${i + 1}`;
      addShape(doc, {
        parent: 'Wave Amplitude',
        kind: 'ellipse',
        name: dotName,
        x: bx,
        y: 0,
        width: 10,
        height: 10,
      });
      applyThemeColor(doc, dotName, 'Ink');
    }

    // -------------------------------------------------------------------------
    // Timelines
    // -------------------------------------------------------------------------
    // 1. Flow: smooth traveling sine wave + counter-weaving helix orbs
    addAnimation(doc, { name: 'Flow', duration: 1.6, loop: 'loop' });
    const kf = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Flow', object, property, keys });

    const totalFrames = 96;
    for (let i = 0; i < 9; i++) {
      const bName = `Fluid Bar ${i + 1}`;
      const dotName = `Helix Dot ${i + 1}`;
      const phase = (i / 9) * Math.PI * 2;

      const s0 = 0.62 + 0.42 * (0.5 + 0.5 * Math.sin(phase));
      const s1 = 0.62 + 0.42 * (0.5 + 0.5 * Math.sin(phase + Math.PI * 0.5));
      const s2 = 0.62 + 0.42 * (0.5 + 0.5 * Math.sin(phase + Math.PI));
      const s3 = 0.62 + 0.42 * (0.5 + 0.5 * Math.sin(phase + Math.PI * 1.5));

      kf(bName, 'scaleY', [
        { frame: 0, value: Math.round(s0 * 100) / 100, ease: 'easeInOut' },
        { frame: 24, value: Math.round(s1 * 100) / 100, ease: 'easeInOut' },
        { frame: 48, value: Math.round(s2 * 100) / 100, ease: 'easeInOut' },
        { frame: 72, value: Math.round(s3 * 100) / 100, ease: 'easeInOut' },
        { frame: totalFrames, value: Math.round(s0 * 100) / 100 },
      ]);

      const y0 = Math.round(Math.cos(phase) * 34);
      const y1 = Math.round(Math.cos(phase + Math.PI * 0.5) * 34);
      const y2 = Math.round(Math.cos(phase + Math.PI) * 34);
      const y3 = Math.round(Math.cos(phase + Math.PI * 1.5) * 34);

      kf(dotName, 'y', [
        { frame: 0, value: y0, ease: 'easeInOut' },
        { frame: 24, value: y1, ease: 'easeInOut' },
        { frame: 48, value: y2, ease: 'easeInOut' },
        { frame: 72, value: y3, ease: 'easeInOut' },
        { frame: totalFrames, value: y0 },
      ]);
    }

    kf('Dock Comet Trim', 'offset', [
      { frame: 0, value: 0, ease: 'linear' },
      { frame: totalFrames, value: 1 },
    ]);

    // 2. Hover Layer: Calm Dock vs. Turbo Dock
    addAnimation(doc, { name: 'Calm Dock', duration: 0.25, loop: 'oneShot' });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Calm Dock', object: 'Dock Hover Scale', property: s, keys: [{ frame: 0, value: 1 }] });
    }
    addKeyframes(doc, { animation: 'Calm Dock', object: 'Wave Amplitude', property: 'scaleY', keys: [{ frame: 0, value: 1 }] });
    addKeyframes(doc, { animation: 'Calm Dock', object: 'Glass Sheen', property: 'x', keys: [{ frame: 0, value: -220 }] });

    addAnimation(doc, { name: 'Turbo Dock', duration: 0.4, loop: 'oneShot' });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Turbo Dock',
        object: 'Dock Hover Scale',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOutBack' },
          { frame: 24, value: 1.08 },
        ],
      });
    }
    addKeyframes(doc, {
      animation: 'Turbo Dock',
      object: 'Wave Amplitude',
      property: 'scaleY',
      keys: [
        { frame: 0, value: 1, ease: 'easeOutBack' },
        { frame: 24, value: 1.24 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Turbo Dock',
      object: 'Glass Sheen',
      property: 'x',
      keys: [
        { frame: 0, value: -220, ease: 'easeInOut' },
        { frame: 24, value: 260 },
      ],
    });

    // 3. Click Layer: Sync Idle vs. Sync Burst
    addAnimation(doc, { name: 'Sync Idle', duration: 0.1, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Sync Idle', object: 'Sonic Shockwave', property: 'opacity', keys: [{ frame: 0, value: 0 }] });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, { animation: 'Sync Idle', object: 'Sonic Shockwave', property: s, keys: [{ frame: 0, value: 0.85 }] });
      addKeyframes(doc, { animation: 'Sync Idle', object: 'Dock Click Pop', property: s, keys: [{ frame: 0, value: 1 }] });
    }

    addAnimation(doc, { name: 'Sync Burst', duration: 0.6, loop: 'oneShot' });
    addKeyframes(doc, {
      animation: 'Sync Burst',
      object: 'Sonic Shockwave',
      property: 'opacity',
      keys: [
        { frame: 0, value: 1, ease: 'easeOut' },
        { frame: 36, value: 0 },
      ],
    });
    for (const s of ['scaleX', 'scaleY'] as const) {
      addKeyframes(doc, {
        animation: 'Sync Burst',
        object: 'Sonic Shockwave',
        property: s,
        keys: [
          { frame: 0, value: 0.9, ease: 'easeOut' },
          { frame: 36, value: 1.38 },
        ],
      });
      addKeyframes(doc, {
        animation: 'Sync Burst',
        object: 'Dock Click Pop',
        property: s,
        keys: [
          { frame: 0, value: 1, ease: 'easeOut' },
          { frame: 6, value: 0.92, ease: 'easeOutBack' },
          { frame: 20, value: 1.08, ease: 'easeInOut' },
          { frame: 36, value: 1 },
        ],
      });
    }

    // State Machine
    addStateMachine(doc, { name: 'Fluid Helix' });
    addInput(doc, { type: 'boolean', name: 'isHovered' });
    addInput(doc, { type: 'trigger', name: 'sync' });

    const machine = ab.stateMachines[0];
    machine.children!.find((c) => c.type === 'StateMachineLayer')!.props.name = 'Flow';
    addState(doc, { layer: 'Flow', animation: 'Flow', x: 200, y: 20 });
    addTransition(doc, { layer: 'Flow', from: 'entry', to: 'Flow' });

    addLayer(doc, 'Fluid Helix', 'Hover');
    addState(doc, { layer: 'Hover', animation: 'Calm Dock', x: 180, y: 20 });
    addState(doc, { layer: 'Hover', animation: 'Turbo Dock', x: 380, y: 20 });
    addTransition(doc, { layer: 'Hover', from: 'entry', to: 'Calm Dock' });
    addTransition(doc, { layer: 'Hover', from: 'Calm Dock', to: 'Turbo Dock', durationMs: 200, conditions: [{ input: 'isHovered', value: true }] });
    addTransition(doc, { layer: 'Hover', from: 'Turbo Dock', to: 'Calm Dock', durationMs: 240, conditions: [{ input: 'isHovered', value: false }] });

    addLayer(doc, 'Fluid Helix', 'Click');
    addState(doc, { layer: 'Click', animation: 'Sync Idle', x: 180, y: 20 });
    addState(doc, { layer: 'Click', animation: 'Sync Burst', x: 380, y: 20 });
    addTransition(doc, { layer: 'Click', from: 'entry', to: 'Sync Idle' });
    addTransition(doc, { layer: 'Click', from: 'any', to: 'Sync Burst', conditions: [{ input: 'sync' }] });
    addTransition(doc, { layer: 'Click', from: 'Sync Burst', to: 'Sync Idle', exitTimeMs: 600, durationMs: 100 });

    const hit = addShape(doc, { kind: 'rectangle', name: 'Hit Area', x: 250, y: 250, width: 500, height: 500, fill: '#ffffff00' });
    moveBefore(ab, hit.id, null, ab.artboard.id);

    addListener(doc, {
      target: 'Hit Area',
      event: 'move',
      name: 'Tilt Capsule',
      actions: [
        { alignTarget: 'Backdrop Parallax' },
        { alignTarget: 'Dock Parallax' },
        { alignTarget: 'Wave Parallax' },
      ],
    });
    addListener(doc, { target: 'Hit Area', event: 'enter', name: 'Enter Turbo', actions: [{ input: 'isHovered', value: true }] });
    addListener(doc, { target: 'Hit Area', event: 'exit', name: 'Exit Turbo', actions: [{ input: 'isHovered', value: false }] });
    addListener(doc, { target: 'Hit Area', event: 'click', name: 'Trigger Sync', actions: [{ input: 'sync' }] });

    doc.editor!.themes[0].name = 'Emerald Synth';
    const frost = addTheme(doc, 'Frost Mint');
    const swatchId = (n: string) => doc.editor!.swatches.find((s) => s.name === n)!.id;
    setSwatchColor(doc, swatchId('Background'), 0xfff0f7f7, frost.id);
    setSwatchColor(doc, swatchId('Dock Fill'), 0xffffffff, frost.id);
    setSwatchColor(doc, swatchId('Dock Bevel'), 0xffcbd5e1, frost.id);
    setSwatchColor(doc, swatchId('Well Fill'), 0xff0f172a, frost.id);
    setSwatchColor(doc, swatchId('Wave Cyan'), 0xff00e5ff, frost.id);
    setSwatchColor(doc, swatchId('Wave Mint'), 0xff10b981, frost.id);
    setSwatchColor(doc, swatchId('Wave Blue'), 0xff3b82f6, frost.id);
    setSwatchColor(doc, swatchId('Wave Rose'), 0xfff43f5e, frost.id);
    setSwatchColor(doc, swatchId('Orbital'), 0xff7c3aed, frost.id);
    setSwatchColor(doc, swatchId('Ink'), 0xffffffff, frost.id);
    applyTheme(doc, doc.editor!.themes[0].id);

    return doc;
  },
};
