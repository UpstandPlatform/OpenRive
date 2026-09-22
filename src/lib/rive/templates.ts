// Starter files for beginners, built with the same high-level API that the
// CLI and MCP tools use. Each one teaches a core Rive idea.
import {
  addAnimation,
  addInput,
  addKeyframes,
  addListener,
  addShape,
  addState,
  addStateMachine,
  addText,
  addTransition,
  defineColor,
  getArtboard,
  applyThemeColor,
} from './api';
import { RiveDoc } from './document';
import { newDoc, solidStroke, obj } from './factory';
import { addTheme, applyTheme, setSwatchColor } from './theme';
import { openriveLogo, upstandLogo } from './templates-brand';

export interface Font {
  name: string;
  bytes: Uint8Array;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  /** what it teaches */
  learn: string[];
  usesText?: boolean;
  build(font?: Font): RiveDoc;
}

function base(name: string, width = 500, height = 500, bg = '#1d1d24'): RiveDoc {
  const doc = newDoc(name);
  const ab = doc.artboards[0];
  ab.artboard.props.width = width;
  ab.artboard.props.height = height;
  // start without the default timeline / state machine; templates add their own
  ab.animations = [];
  ab.stateMachines = [];
  defineColor(doc, 'Background', bg);
  applyThemeColor(doc, ab.artboard.id, 'Background');
  return doc;
}

const blank: Template = {
  id: 'blank',
  name: 'Blank',
  description: 'An empty 500×500 artboard with a timeline and a state machine.',
  learn: ['Start from scratch'],
  build: () => newDoc('Artboard'),
};

const bouncingBall: Template = {
  id: 'bouncing-ball',
  name: 'Bouncing Ball',
  description: 'A looping bounce with easing and squash & stretch.',
  learn: ['Timelines and keyframes', 'Easing curves', 'Scale animation'],
  build() {
    const doc = base('Bouncing Ball');
    defineColor(doc, 'Ball', '#ff5c7a');
    addShape(doc, { kind: 'ellipse', name: 'Shadow', x: 250, y: 430, width: 110, height: 18, fill: '#00000066' });
    addShape(doc, { kind: 'ellipse', name: 'Ball', x: 250, y: 120, width: 90, height: 90 });
    applyThemeColor(doc, 'Ball', 'Ball');
    addAnimation(doc, { name: 'Bounce', duration: 1, loop: 'loop' });
    const k = (object: string, property: string, keys: Parameters<typeof addKeyframes>[1]['keys']) =>
      addKeyframes(doc, { animation: 'Bounce', object, property, keys });
    k('Ball', 'y', [
      { frame: 0, value: 120, ease: 'easeIn' },
      { frame: 30, value: 385, ease: 'easeOut' },
      { frame: 60, value: 120 },
    ]);
    k('Ball', 'scaleX', [
      { frame: 0, value: 0.95 },
      { frame: 27, value: 0.95 },
      { frame: 30, value: 1.3 },
      { frame: 34, value: 0.95 },
      { frame: 60, value: 0.95 },
    ]);
    k('Ball', 'scaleY', [
      { frame: 0, value: 1.05 },
      { frame: 27, value: 1.05 },
      { frame: 30, value: 0.72 },
      { frame: 34, value: 1.05 },
      { frame: 60, value: 1.05 },
    ]);
    k('Shadow', 'scaleX', [
      { frame: 0, value: 0.45, ease: 'easeIn' },
      { frame: 30, value: 1.1, ease: 'easeOut' },
      { frame: 60, value: 0.45 },
    ]);
    k('Shadow', 'opacity', [
      { frame: 0, value: 0.35, ease: 'easeIn' },
      { frame: 30, value: 1, ease: 'easeOut' },
      { frame: 60, value: 0.35 },
    ]);
    // play it by default through a simple state machine
    addStateMachine(doc, { name: 'State Machine 1' });
    addState(doc, { animation: 'Bounce', x: 200, y: 20 });
    addTransition(doc, { from: 'entry', to: 'Bounce' });
    return doc;
  },
};

const button: Template = {
  id: 'interactive-button',
  name: 'Interactive Button',
  description: 'Hover and press states driven by pointer listeners.',
  learn: ['State machines', 'Boolean inputs', 'Pointer listeners (enter / exit / down / up)'],
  usesText: true,
  build(font) {
    const doc = base('Interactive Button');
    defineColor(doc, 'Primary', '#3d8bd0');
    defineColor(doc, 'Primary Hover', '#57a5e0');
    defineColor(doc, 'Label', '#ffffff');
    addShape(doc, { kind: 'rectangle', name: 'Button', x: 250, y: 250, width: 220, height: 72, cornerRadius: 36 });
    applyThemeColor(doc, 'Button', 'Primary');
    if (font) {
      addText(doc, { parent: 'Button', text: 'Click me', x: 0, y: 0, origin: 'center', align: 'center', fontSize: 26, font, name: 'Label' });
      applyThemeColor(doc, 'Label', 'Label');
    }
    addAnimation(doc, { name: 'Idle', duration: 0.2, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Idle', object: 'Button', property: 'scaleX', keys: [{ frame: 0, value: 1 }] });
    addKeyframes(doc, { animation: 'Idle', object: 'Button', property: 'scaleY', keys: [{ frame: 0, value: 1 }] });
    addKeyframes(doc, { animation: 'Idle', object: 'Button', property: 'fill', keys: [{ frame: 0, themeColor: 'Primary' }] });
    addAnimation(doc, { name: 'Hover', duration: 0.25, loop: 'oneShot' });
    addKeyframes(doc, {
      animation: 'Hover',
      object: 'Button',
      property: 'scaleX',
      keys: [
        { frame: 0, value: 1, ease: 'easeOutBack' },
        { frame: 15, value: 1.08 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Hover',
      object: 'Button',
      property: 'scaleY',
      keys: [
        { frame: 0, value: 1, ease: 'easeOutBack' },
        { frame: 15, value: 1.08 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Hover',
      object: 'Button',
      property: 'fill',
      keys: [
        { frame: 0, themeColor: 'Primary' },
        { frame: 15, themeColor: 'Primary Hover' },
      ],
    });
    addAnimation(doc, { name: 'Pressed', duration: 0.15, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Pressed', object: 'Button', property: 'scaleX', keys: [{ frame: 0, value: 1.08 }, { frame: 9, value: 0.94 }] });
    addKeyframes(doc, { animation: 'Pressed', object: 'Button', property: 'scaleY', keys: [{ frame: 0, value: 1.08 }, { frame: 9, value: 0.94 }] });
    addStateMachine(doc, { name: 'Button' });
    addInput(doc, { type: 'boolean', name: 'isHover' });
    addInput(doc, { type: 'boolean', name: 'isPressed' });
    addState(doc, { animation: 'Idle', x: 200, y: 20 });
    addState(doc, { animation: 'Hover', x: 380, y: 20 });
    addState(doc, { animation: 'Pressed', x: 380, y: 100 });
    addTransition(doc, { from: 'entry', to: 'Idle' });
    addTransition(doc, { from: 'Idle', to: 'Hover', conditions: [{ input: 'isHover', value: true }] });
    addTransition(doc, { from: 'Hover', to: 'Idle', durationMs: 150, conditions: [{ input: 'isHover', value: false }] });
    addTransition(doc, { from: 'Hover', to: 'Pressed', conditions: [{ input: 'isPressed', value: true }] });
    addTransition(doc, { from: 'Pressed', to: 'Hover', conditions: [{ input: 'isPressed', value: false }] });
    addListener(doc, { target: 'Button', event: 'enter', name: 'Enter', actions: [{ input: 'isHover', value: true }] });
    addListener(doc, { target: 'Button', event: 'exit', name: 'Exit', actions: [{ input: 'isHover', value: false }, { input: 'isPressed', value: false }] });
    addListener(doc, { target: 'Button', event: 'down', name: 'Down', actions: [{ input: 'isPressed', value: true }] });
    addListener(doc, { target: 'Button', event: 'up', name: 'Up', actions: [{ input: 'isPressed', value: false }] });
    return doc;
  },
};

const spinner: Template = {
  id: 'loading-spinner',
  name: 'Loading Spinner',
  description: 'A rotating arc made with a stroke and a trim path.',
  learn: ['Strokes and trim paths', 'Linear rotation loops'],
  build() {
    const doc = base('Loading Spinner', 300, 300);
    defineColor(doc, 'Accent', '#27c498');
    const ring = addShape(doc, { kind: 'ellipse', name: 'Track', x: 150, y: 150, width: 120, height: 120, fill: null, stroke: '#ffffff1f', strokeWidth: 12 });
    void ring;
    const arc = addShape(doc, { kind: 'ellipse', name: 'Arc', x: 150, y: 150, width: 120, height: 120, fill: null });
    const ab = getArtboard(doc);
    const [stroke, solid] = solidStroke(arc.id, 0xff27c498, 12);
    stroke.props.cap = 1;
    const trim = obj('TrimPath', { parentId: stroke.id, start: 0, end: 0.3, offset: 0, modeValue: 1 });
    ab.objects.push(stroke, solid, trim);
    applyThemeColor(doc, 'Arc', 'Accent', 'Stroke');
    addAnimation(doc, { name: 'Spin', duration: 1, loop: 'loop' });
    addKeyframes(doc, {
      animation: 'Spin',
      object: 'Arc',
      property: 'rotationDegrees',
      keys: [
        { frame: 0, value: 0, ease: 'linear' },
        { frame: 60, value: 360 },
      ],
    });
    addKeyframes(doc, {
      animation: 'Spin',
      object: trim.id,
      property: 'end',
      keys: [
        { frame: 0, value: 0.1 },
        { frame: 30, value: 0.7 },
        { frame: 60, value: 0.1 },
      ],
    });
    addStateMachine(doc, { name: 'State Machine 1' });
    addState(doc, { animation: 'Spin', x: 200, y: 20 });
    addTransition(doc, { from: 'entry', to: 'Spin' });
    return doc;
  },
};

const toggle: Template = {
  id: 'toggle-switch',
  name: 'Toggle Switch',
  description: 'Click to switch on and off. A boolean input drives two states.',
  learn: ['Toggle a boolean from a click listener', 'Transitions with conditions and durations'],
  build() {
    const doc = base('Toggle Switch', 400, 300);
    defineColor(doc, 'Off', '#3a3a44');
    defineColor(doc, 'On', '#27c498');
    defineColor(doc, 'Knob', '#ffffff');
    addShape(doc, { kind: 'rectangle', name: 'Track', x: 200, y: 150, width: 160, height: 84, cornerRadius: 42 });
    addShape(doc, { kind: 'ellipse', name: 'Knob', parent: 'Track', x: -38, y: 0, width: 64, height: 64 });
    applyThemeColor(doc, 'Knob', 'Knob');
    addAnimation(doc, { name: 'Off', duration: 0.3, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'Off', object: 'Knob', property: 'x', keys: [{ frame: 0, value: 38, ease: 'easeOutBack' }, { frame: 18, value: -38 }] });
    addKeyframes(doc, { animation: 'Off', object: 'Track', property: 'fill', keys: [{ frame: 0, themeColor: 'On' }, { frame: 18, themeColor: 'Off' }] });
    addAnimation(doc, { name: 'On', duration: 0.3, loop: 'oneShot' });
    addKeyframes(doc, { animation: 'On', object: 'Knob', property: 'x', keys: [{ frame: 0, value: -38, ease: 'easeOutBack' }, { frame: 18, value: 38 }] });
    addKeyframes(doc, { animation: 'On', object: 'Track', property: 'fill', keys: [{ frame: 0, themeColor: 'Off' }, { frame: 18, themeColor: 'On' }] });
    applyThemeColor(doc, 'Track', 'Off');
    addStateMachine(doc, { name: 'Toggle' });
    addInput(doc, { type: 'boolean', name: 'isOn' });
    addState(doc, { animation: 'Off', x: 200, y: 20 });
    addState(doc, { animation: 'On', x: 380, y: 20 });
    addTransition(doc, { from: 'entry', to: 'Off' });
    addTransition(doc, { from: 'Off', to: 'On', conditions: [{ input: 'isOn', value: true }] });
    addTransition(doc, { from: 'On', to: 'Off', conditions: [{ input: 'isOn', value: false }] });
    addListener(doc, { target: 'Track', event: 'click', name: 'Toggle', actions: [{ input: 'isOn', value: 'toggle' }] });
    return doc;
  },
};

const favorite: Template = {
  id: 'favorite-star',
  name: 'Favorite Star',
  description: 'A trigger input fires a springy pop when the star is clicked.',
  learn: ['Trigger inputs', 'Returning to a state with exit time', 'Rotation and scale overshoot'],
  build() {
    const doc = base('Favorite Star', 300, 300);
    defineColor(doc, 'Star', '#ffcf33');
    addShape(doc, { kind: 'star', name: 'Star', x: 150, y: 150, width: 140, height: 140, innerRadius: 0.45, points: 5, cornerRadius: 6 });
    applyThemeColor(doc, 'Star', 'Star');
    addAnimation(doc, { name: 'Idle', duration: 2, loop: 'pingPong' });
    addKeyframes(doc, { animation: 'Idle', object: 'Star', property: 'rotationDegrees', keys: [{ frame: 0, value: -6 }, { frame: 120, value: 6 }] });
    addAnimation(doc, { name: 'Pop', duration: 0.6, loop: 'oneShot' });
    for (const p of ['scaleX', 'scaleY']) {
      addKeyframes(doc, {
        animation: 'Pop',
        object: 'Star',
        property: p,
        keys: [
          { frame: 0, value: 1, ease: 'easeOut' },
          { frame: 8, value: 0.7, ease: 'easeOutBack' },
          { frame: 30, value: 1.35, ease: 'easeInOut' },
          { frame: 36, value: 1 },
        ],
      });
    }
    addKeyframes(doc, { animation: 'Pop', object: 'Star', property: 'rotationDegrees', keys: [{ frame: 0, value: 0, ease: 'easeOut' }, { frame: 36, value: 144 }] });
    addStateMachine(doc, { name: 'Star' });
    addInput(doc, { type: 'trigger', name: 'pop' });
    addState(doc, { animation: 'Idle', x: 200, y: 20 });
    addState(doc, { animation: 'Pop', x: 380, y: 20 });
    addTransition(doc, { from: 'entry', to: 'Idle' });
    addTransition(doc, { from: 'Idle', to: 'Pop', conditions: [{ input: 'pop' }] });
    addTransition(doc, { from: 'Pop', to: 'Idle', exitTimeMs: 600, durationMs: 150 });
    addListener(doc, { target: 'Star', event: 'click', name: 'Click', actions: [{ input: 'pop' }] });
    return doc;
  },
};

const helloText: Template = {
  id: 'hello-text',
  name: 'Text & Themes',
  description: 'Animated text using theme colors, with a Light and a Dark theme to switch between.',
  learn: ['Text objects', 'Theme colors and multiple themes', 'Opacity and position keys'],
  usesText: true,
  build(font) {
    const doc = base('Text & Themes', 600, 400, '#16161c');
    defineColor(doc, 'Title', '#ffffff');
    defineColor(doc, 'Accent', '#f25ca2');
    if (font) {
      addText(doc, { text: 'Hello, Rive!', x: 150, y: 150, fontSize: 56, font, name: 'Title' });
      applyThemeColor(doc, 'Title', 'Title');
      addText(doc, { text: 'Edit me, then switch themes', x: 150, y: 235, fontSize: 22, font, name: 'Subtitle' });
      applyThemeColor(doc, 'Subtitle', 'Accent');
    }
    addShape(doc, { kind: 'rectangle', name: 'Underline', x: 300, y: 222, width: 300, height: 6, cornerRadius: 3 });
    applyThemeColor(doc, 'Underline', 'Accent');
    addAnimation(doc, { name: 'Intro', duration: 1.2, loop: 'oneShot' });
    if (font) {
      addKeyframes(doc, { animation: 'Intro', object: 'Title', property: 'y', keys: [{ frame: 0, value: 190, ease: 'easeOut' }, { frame: 36, value: 150 }] });
      addKeyframes(doc, { animation: 'Intro', object: 'Title', property: 'opacity', keys: [{ frame: 0, value: 0, ease: 'easeOut' }, { frame: 36, value: 1 }] });
      addKeyframes(doc, { animation: 'Intro', object: 'Subtitle', property: 'opacity', keys: [{ frame: 0, value: 0 }, { frame: 30, value: 0, ease: 'easeOut' }, { frame: 60, value: 1 }] });
    }
    addKeyframes(doc, { animation: 'Intro', object: 'Underline', property: 'scaleX', keys: [{ frame: 0, value: 0 }, { frame: 20, value: 0, ease: 'easeOutBack' }, { frame: 56, value: 1 }] });
    addStateMachine(doc, { name: 'State Machine 1' });
    addState(doc, { animation: 'Intro', x: 200, y: 20 });
    addTransition(doc, { from: 'entry', to: 'Intro' });
    // a second theme: light
    const light = addTheme(doc, 'Light');
    const id = (n: string) => doc.editor!.swatches.find((s) => s.name === n)!.id;
    setSwatchColor(doc, id('Background'), 0xfff4f1ea, light.id);
    setSwatchColor(doc, id('Title'), 0xff1d1d24, light.id);
    setSwatchColor(doc, id('Accent'), 0xff3d8bd0, light.id);
    doc.editor!.themes[0].name = 'Dark';
    applyTheme(doc, doc.editor!.themes[0].id);
    return doc;
  },
};

export const TEMPLATES: Template[] = [blank, openriveLogo, upstandLogo, bouncingBall, button, toggle, spinner, favorite, helloText];

export function getTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id);
}
