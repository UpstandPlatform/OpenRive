// Builds a standalone preview bundle: a zip holding the .riv file, an index.html
// and an index.js player, so an animation can be shown (and shipped) without
// OpenRive. DOM-free, so the web app, the CLI and the MCP server share it.
import { ArtboardDoc, RiveDoc } from './document';
import { prop } from './scene';
import { isA } from './schema';

/** Runtime version used for the CDN flavour when the caller does not know one. */
export const DEFAULT_RUNTIME_VERSION = '2.42.2';

export interface BundleFile {
  /** path inside the zip, always with forward slashes */
  name: string;
  data: Uint8Array;
}

export interface BundleInput {
  name: string;
  type: 'bool' | 'number' | 'trigger';
}

export interface BundleManifest {
  /** human readable project name */
  name: string;
  /** .riv file name inside the bundle */
  file: string;
  /** 'offline' ships the runtime in the bundle, 'cdn' loads it from unpkg */
  runtime: 'offline' | 'cdn';
  /** folder (or URL prefix) holding canvas_advanced.mjs and rive.wasm */
  runtimeBase: string;
  runtimeVersion: string;
  artboards: {
    name: string;
    width: number;
    height: number;
    stateMachines: { name: string; inputs: BundleInput[] }[];
    timelines: { name: string; fps: number; durationSeconds: number }[];
  }[];
}

export interface BundleOptions {
  /** project name, used for the file names and the page title */
  name: string;
  /** the exported .riv bytes */
  riv: Uint8Array;
  /** document the .riv came from, used to list artboards, timelines and inputs */
  doc: RiveDoc;
  /** 'offline' (default) needs runtimeFiles; 'cdn' imports the runtime from unpkg */
  runtime?: 'offline' | 'cdn';
  /** runtime files placed under runtime/ — canvas_advanced.mjs, rive.wasm, … */
  runtimeFiles?: BundleFile[];
  /** version of the Rive runtime, used by the CDN import and the README */
  runtimeVersion?: string;
  /** timestamp stored in the zip entries */
  modified?: Date;
}

const UNPKG = 'https://unpkg.com/@rive-app/canvas-advanced@';

/** A safe file/slug name for a project ("My file!" -> "my-file"). */
export function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'animation'
  );
}

const enc = new TextEncoder();
const textFile = (name: string, text: string): BundleFile => ({ name, data: enc.encode(text) });

function artboardManifest(ab: ArtboardDoc): BundleManifest['artboards'][number] {
  return {
    name: String(ab.artboard.props.name || 'Artboard'),
    width: prop(ab.artboard, 'width'),
    height: prop(ab.artboard, 'height'),
    stateMachines: ab.stateMachines.map((sm) => ({
      name: String(sm.props.name || 'State Machine'),
      inputs: (sm.children ?? [])
        .filter((c) => isA(c.type, 'StateMachineInput'))
        .map((i) => ({
          name: String(i.props.name || 'Input'),
          type: (i.type === 'StateMachineBool' ? 'bool' : i.type === 'StateMachineNumber' ? 'number' : 'trigger') as BundleInput['type'],
        })),
    })),
    timelines: ab.animations.map((a) => {
      const fps = prop(a, 'fps') || 60;
      return {
        name: String(a.props.name || 'Timeline'),
        fps,
        durationSeconds: Math.round((prop(a, 'duration') / fps) * 1000) / 1000,
      };
    }),
  };
}

/** What the generated player needs to know about the file. */
export function bundleManifest(opts: BundleOptions): BundleManifest {
  const runtime = opts.runtime ?? 'offline';
  const version = opts.runtimeVersion ?? DEFAULT_RUNTIME_VERSION;
  return {
    name: opts.name,
    file: `${slug(opts.name)}.riv`,
    runtime,
    runtimeBase: runtime === 'cdn' ? `${UNPKG}${version}/` : './runtime/',
    runtimeVersion: version,
    artboards: opts.doc.artboards.map(artboardManifest),
  };
}

// ---------------------------------------------------------------------------
// The generated player. Plain ES2020 JavaScript written with string
// concatenation only, so it stays readable inside the bundle.

const PLAYER_JS = `let runtimePromise = null;

/** Loads the Rive WASM runtime (bundled under runtime/, or from the CDN). */
export function loadRuntime() {
  if (!runtimePromise) {
    const base = new URL(manifest.runtimeBase, import.meta.url).href;
    // the runtime asks for canvas_advanced.wasm; the package ships it as rive.wasm
    const locateFile = (file) => base + (file.endsWith('.wasm') ? 'rive.wasm' : file);
    runtimePromise = import(base + 'canvas_advanced.mjs').then((mod) => mod.default({ locateFile: locateFile }));
    runtimePromise.catch(() => {
      runtimePromise = null; // allow a retry
    });
  }
  return runtimePromise;
}

/** Reads the bundled .riv file. */
export async function loadFile() {
  const url = new URL(manifest.file, import.meta.url).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not read ' + manifest.file + ' (' + res.status + '). Serve this folder over HTTP — see README.md.');
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Plays the file on a canvas.
 *   artboard      index or name (default 0)
 *   stateMachine  index or name, -1 to run a timeline instead (default 0)
 *   timeline      index used when no state machine runs (default 0)
 *   mixAll        play every timeline at once
 *   onInputs / onProperties / onEvent   callbacks used by the controls
 */
export async function createPlayer(options) {
  const opts = options || {};
  const canvas = opts.canvas;
  if (!canvas) throw new Error('createPlayer needs a canvas');
  const rive = await loadRuntime();
  const bytes = opts.bytes || (await loadFile());
  const renderer = rive.makeRenderer(canvas);
  const file = await rive.load(bytes, undefined, false);

  let artboard = null;
  if (typeof opts.artboard === 'string') artboard = file.artboardByName(opts.artboard);
  if (!artboard) artboard = file.artboardByIndex(Math.min(Math.max(0, Number(opts.artboard) || 0), file.artboardCount() - 1));

  let sm = null;
  let anim = null;
  const extra = [];
  const wanted = opts.stateMachine === undefined ? 0 : opts.stateMachine;
  let smIndex = -1;
  if (typeof wanted === 'string') {
    for (let i = 0; i < artboard.stateMachineCount(); i++) {
      if (artboard.stateMachineByIndex(i).name === wanted) smIndex = i;
    }
  } else smIndex = Number(wanted);
  if (smIndex >= 0 && artboard.stateMachineCount() > smIndex) {
    sm = new rive.StateMachineInstance(artboard.stateMachineByIndex(smIndex), artboard);
  } else if (artboard.animationCount() > 0) {
    const first = Math.min(Math.max(0, Number(opts.timeline) || 0), artboard.animationCount() - 1);
    anim = new rive.LinearAnimationInstance(artboard.animationByIndex(first), artboard);
    if (opts.mixAll) {
      for (let i = 0; i < artboard.animationCount(); i++) {
        if (i !== first) extra.push(new rive.LinearAnimationInstance(artboard.animationByIndex(i), artboard));
      }
    }
  }

  // Files that use data binding need their default view model instance bound,
  // otherwise bound properties (and anything driven by them) stay static.
  let vmi = null;
  let viewModel = null;
  try {
    const vm = file.viewModelCount() > 0 ? file.defaultArtboardViewModel(artboard) : null;
    if (vm) {
      viewModel = vm.name;
      vmi = vm.defaultInstance() || vm.instance();
      if (vmi) {
        if (sm) sm.bindViewModelInstance(vmi);
        else artboard.bindViewModelInstance(vmi);
      }
    }
  } catch (e) {
    vmi = null;
  }

  const readInputs = () => {
    const out = [];
    if (!sm) return out;
    for (let i = 0; i < sm.inputCount(); i++) {
      const input = sm.input(i);
      const type = input.type === rive.SMIInput.bool ? 'bool' : input.type === rive.SMIInput.number ? 'number' : 'trigger';
      out.push({ name: input.name, type: type, value: type === 'trigger' ? false : input.value });
    }
    return out;
  };

  const readProperties = () => {
    const out = [];
    if (!vmi) return out;
    for (const p of vmi.getProperties()) {
      const t = String(p.type);
      let value = null;
      let values = undefined;
      try {
        if (t === 'number' || t === 'integer') value = vmi.number(p.name).value;
        else if (t === 'boolean') value = vmi.boolean(p.name).value;
        else if (t === 'string') value = vmi.string(p.name).value;
        else if (t === 'color') value = vmi.color(p.name).value;
        else if (t === 'enumType') {
          const e = vmi.enum(p.name);
          value = e.value;
          values = e.values;
        }
      } catch (e) {
        value = null;
      }
      out.push({ name: p.name, type: t, value: value, options: values });
    }
    return out;
  };

  // layout: contain + center, like the OpenRive preview
  const layout = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const b = artboard.bounds;
    const aw = b.maxX - b.minX;
    const ah = b.maxY - b.minY;
    const scale = Math.min(w / aw, h / ah);
    return { scale: scale, ox: (w - aw * scale) / 2, oy: (h - ah * scale) / 2, dpr: dpr };
  };

  const toArtboard = (e) => {
    const r = canvas.getBoundingClientRect();
    const l = layout();
    return [((e.clientX - r.left) * l.dpr - l.ox) / l.scale, ((e.clientY - r.top) * l.dpr - l.oy) / l.scale];
  };
  const point = (fn) => (e) => {
    if (!sm) return;
    const p = toArtboard(e);
    fn(p[0], p[1]);
  };
  const down = point((x, y) => sm.pointerDown(x, y, 0));
  const move = point((x, y) => sm.pointerMove(x, y, 0));
  const up = point((x, y) => sm.pointerUp(x, y, 0));
  const leave = point((x, y) => sm.pointerExit(x, y, 0));
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointerleave', leave);

  let disposed = false;
  let paused = !!opts.paused;
  let raf = 0;
  let last = 0;
  let poll = 0;
  const frame = (t) => {
    if (disposed) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    const step = paused ? 0 : dt;
    if (sm) {
      sm.advanceAndApply(step);
      const n = sm.reportedEventCount();
      for (let i = 0; i < n; i++) {
        const ev = sm.reportedEventAt(i);
        if (ev && opts.onEvent) opts.onEvent(ev.name);
      }
      if (++poll % 10 === 0) {
        if (opts.onInputs) opts.onInputs(readInputs());
        if (opts.onProperties) opts.onProperties(readProperties(), viewModel);
      }
    } else if (anim) {
      anim.advance(step);
      anim.apply(1);
      for (const a of extra) {
        a.advance(step);
        a.apply(1);
      }
      artboard.advance(step);
    } else {
      artboard.advance(step);
    }
    const l = layout();
    renderer.clear();
    renderer.save();
    renderer.transform(l.scale, 0, 0, l.scale, l.ox, l.oy);
    artboard.draw(renderer);
    renderer.restore();
    raf = rive.requestAnimationFrame(frame);
  };
  raf = rive.requestAnimationFrame(frame);

  if (opts.onInputs) opts.onInputs(readInputs());
  if (opts.onProperties) opts.onProperties(readProperties(), viewModel);

  return {
    canvas: canvas,
    artboard: artboard,
    viewModel: viewModel,
    inputs: readInputs,
    properties: readProperties,
    setInput: function (name, value) {
      if (!sm) return;
      for (let i = 0; i < sm.inputCount(); i++) {
        const input = sm.input(i);
        if (input.name !== name) continue;
        if (input.type === rive.SMIInput.trigger) input.asTrigger().fire();
        else if (input.type === rive.SMIInput.bool) input.asBool().value = !!value;
        else input.asNumber().value = Number(value);
      }
      if (opts.onInputs) opts.onInputs(readInputs());
    },
    setProperty: function (name, type, value) {
      if (!vmi) return;
      try {
        if (type === 'number' || type === 'integer') vmi.number(name).value = Number(value);
        else if (type === 'boolean') vmi.boolean(name).value = !!value;
        else if (type === 'string') vmi.string(name).value = String(value);
        else if (type === 'color') vmi.color(name).value = Number(value) | 0;
        else if (type === 'enumType') vmi.enum(name).value = String(value);
        else if (type === 'trigger') vmi.trigger(name).trigger();
      } catch (e) {
        /* unsupported property */
      }
      if (opts.onProperties) opts.onProperties(readProperties(), viewModel);
    },
    pause: function () {
      paused = true;
    },
    play: function () {
      paused = false;
    },
    dispose: function () {
      disposed = true;
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointerleave', leave);
      rive.cancelAnimationFrame(raf);
      if (sm) sm.delete();
      if (anim) anim.delete();
      for (const a of extra) a.delete();
      if (vmi && vmi.unref) vmi.unref();
      if (renderer.delete) renderer.delete();
      artboard.delete();
      if (file.unref) file.unref();
    },
  };
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const option = (label, value) => {
  const o = document.createElement('option');
  o.textContent = label;
  o.value = String(value);
  return o;
};

/**
 * Renders the whole preview — artboard / state machine pickers, inputs, data
 * bound properties and the event log — into an element. Needs styles.css.
 */
export async function mountPreview(root, options) {
  const opts = options || {};
  if (!manifest.artboards.length) return null;
  const state = {
    artboard: 0,
    stateMachine: 0,
    timeline: 0,
    mixAll: !manifest.artboards[0].stateMachines.length,
    background: opts.background || 'dark',
  };

  const bar = el('div', 'or-bar');
  const artboardSel = el('select', 'or-field');
  const smSel = el('select', 'or-field');
  const timelineSel = el('select', 'or-field');
  const bgSel = el('select', 'or-field');
  const restart = el('button', 'or-btn', 'Restart');
  bgSel.append(option('Dark', 'dark'), option('Light', 'light'), option('Transparent', 'checker'));
  bgSel.value = state.background;
  bar.append(el('span', 'or-title', manifest.name), artboardSel, smSel, timelineSel, el('span', 'or-spacer'), bgSel, restart);

  const stage = el('div', 'or-stage or-bg-' + state.background);
  const canvas = el('canvas', 'or-canvas');
  const message = el('div', 'or-message');
  stage.append(canvas, message);
  const side = el('aside', 'or-side');
  const body = el('div', 'or-body');
  body.append(stage, side);
  root.classList.add('or-root');
  root.append(bar, body);

  const fillArtboards = () => {
    artboardSel.textContent = '';
    manifest.artboards.forEach((a, i) => artboardSel.append(option(a.name, i)));
    artboardSel.value = String(state.artboard);
    artboardSel.style.display = manifest.artboards.length > 1 ? '' : 'none';
  };

  const fillScenes = () => {
    const ab = manifest.artboards[state.artboard];
    smSel.textContent = '';
    ab.stateMachines.forEach((m, i) => smSel.append(option(m.name, i)));
    smSel.append(option('Timeline only', -1));
    smSel.value = String(ab.stateMachines.length && !state.mixAll ? state.stateMachine : -1);
    smSel.style.display = ab.stateMachines.length ? '' : 'none';
    timelineSel.textContent = '';
    timelineSel.append(option('All timelines', -1));
    ab.timelines.forEach((t, i) => timelineSel.append(option(t.name, i)));
    timelineSel.value = String(state.mixAll ? -1 : state.timeline);
    const usingTimeline = !ab.stateMachines.length || Number(smSel.value) < 0;
    timelineSel.style.display = usingTimeline && ab.timelines.length ? '' : 'none';
  };

  let player = null;
  let inputs = [];
  let properties = [];
  let viewModel = null;
  let events = [];

  const inputRow = (input) => {
    const row = el('div', 'or-row');
    row.append(el('span', 'or-name', input.name));
    if (input.type === 'trigger') {
      const b = el('button', 'or-btn', 'Fire');
      b.onclick = () => player && player.setInput(input.name, true);
      row.append(b);
    } else if (input.type === 'bool') {
      const c = el('input', 'or-check');
      c.type = 'checkbox';
      c.checked = !!input.value;
      c.onchange = () => player && player.setInput(input.name, c.checked);
      row.append(c);
    } else {
      const n = el('input', 'or-field or-num');
      n.type = 'number';
      n.value = String(input.value);
      n.oninput = () => player && player.setInput(input.name, Number(n.value));
      row.append(n);
    }
    return row;
  };

  const propertyRow = (p) => {
    const row = el('div', 'or-row');
    row.append(el('span', 'or-name', p.name));
    const set = (v) => player && player.setProperty(p.name, p.type, v);
    if (p.type === 'number' || p.type === 'integer') {
      const n = el('input', 'or-field or-num');
      n.type = 'number';
      n.value = String(p.value === null ? 0 : p.value);
      n.oninput = () => set(Number(n.value));
      row.append(n);
    } else if (p.type === 'boolean') {
      const c = el('input', 'or-check');
      c.type = 'checkbox';
      c.checked = !!p.value;
      c.onchange = () => set(c.checked);
      row.append(c);
    } else if (p.type === 'string') {
      const t = el('input', 'or-field');
      t.value = p.value === null ? '' : String(p.value);
      t.oninput = () => set(t.value);
      row.append(t);
    } else if (p.type === 'color') {
      const c = el('input', 'or-color');
      c.type = 'color';
      c.value = '#' + ((Number(p.value || 0) >>> 0) & 0xffffff).toString(16).padStart(6, '0');
      c.oninput = () => set((0xff000000 | parseInt(c.value.slice(1), 16)) | 0);
      row.append(c);
    } else if (p.type === 'enumType') {
      const s = el('select', 'or-field');
      for (const o of p.options || []) s.append(option(o, o));
      s.value = String(p.value);
      s.onchange = () => set(s.value);
      row.append(s);
    } else if (p.type === 'trigger') {
      const b = el('button', 'or-btn', 'Fire');
      b.onclick = () => set(true);
      row.append(b);
    } else row.append(el('span', 'or-type', p.type));
    return row;
  };

  const renderSide = () => {
    side.textContent = '';
    if (properties.length) {
      side.append(el('div', 'or-label', 'View model' + (viewModel ? ' · ' + viewModel : '')));
      for (const p of properties) side.append(propertyRow(p));
    }
    if (inputs.length) {
      side.append(el('div', 'or-label', 'Inputs'));
      for (const i of inputs) side.append(inputRow(i));
    }
    if (events.length) {
      side.append(el('div', 'or-label', 'Events'));
      for (const e of events) side.append(el('div', 'or-event', e));
    }
    side.style.display = side.childNodes.length ? '' : 'none';
  };

  const start = async () => {
    if (player) player.dispose();
    player = null;
    inputs = [];
    properties = [];
    events = [];
    message.textContent = '';
    renderSide();
    try {
      player = await createPlayer({
        canvas: canvas,
        artboard: state.artboard,
        stateMachine: manifest.artboards[state.artboard].stateMachines.length && !state.mixAll ? state.stateMachine : -1,
        timeline: state.timeline,
        mixAll: state.mixAll,
        onInputs: (v) => {
          inputs = v;
          renderSide();
        },
        onProperties: (v, name) => {
          properties = v;
          viewModel = name;
          renderSide();
        },
        onEvent: (name) => {
          events = [new Date().toLocaleTimeString() + '  ' + name].concat(events).slice(0, 30);
          renderSide();
        },
      });
    } catch (e) {
      message.textContent = (e && e.message) || String(e);
    }
  };

  artboardSel.onchange = () => {
    state.artboard = Number(artboardSel.value);
    state.stateMachine = 0;
    state.timeline = 0;
    state.mixAll = !manifest.artboards[state.artboard].stateMachines.length;
    fillScenes();
    start();
  };
  smSel.onchange = () => {
    const v = Number(smSel.value);
    state.mixAll = v < 0;
    if (v >= 0) state.stateMachine = v;
    fillScenes();
    start();
  };
  timelineSel.onchange = () => {
    const v = Number(timelineSel.value);
    state.mixAll = v < 0;
    state.timeline = Math.max(0, v);
    start();
  };
  bgSel.onchange = () => {
    stage.className = 'or-stage or-bg-' + bgSel.value;
  };
  restart.onclick = () => start();

  fillArtboards();
  fillScenes();
  renderSide();
  await start();
  return { restart: start, player: () => player };
}
`;

function indexJs(manifest: BundleManifest) {
  return [
    '// index.js — standalone player for this Rive animation, exported from OpenRive.',
    '//',
    "//   import { mountPreview } from './index.js';   // the whole preview UI",
    "//   import { createPlayer } from './index.js';   // just the canvas player",
    '//',
    '// Serve this folder over HTTP (see README.md); browsers refuse to load the',
    '// runtime and the .riv file from file:// URLs.',
    '',
    `export const manifest = ${JSON.stringify(manifest, null, 2)};`,
    '',
    PLAYER_JS,
  ].join('\n');
}

const STYLES_CSS = `/* Styling for the preview UI built by mountPreview(). */
:root {
  --or-bg: #161616;
  --or-bg2: #1e1e1e;
  --or-line: #2e2e2e;
  --or-text: #ededed;
  --or-text2: #a0a0a0;
  --or-accent: #3d8bd0;
}
* {
  box-sizing: border-box;
}
html,
body {
  height: 100%;
  margin: 0;
}
body {
  background: var(--or-bg);
  color: var(--or-text);
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.or-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.or-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--or-line);
  background: var(--or-bg2);
}
.or-title {
  font-weight: 600;
  margin-right: 8px;
}
.or-spacer {
  flex: 1;
}
.or-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.or-field {
  height: 28px;
  max-width: 200px;
  padding: 0 8px;
  color: var(--or-text);
  background: var(--or-bg);
  border: 1px solid var(--or-line);
  border-radius: 6px;
}
.or-num {
  width: 84px;
}
.or-btn {
  height: 28px;
  padding: 0 10px;
  cursor: pointer;
  color: var(--or-text);
  background: var(--or-bg);
  border: 1px solid var(--or-line);
  border-radius: 6px;
}
.or-btn:hover {
  border-color: var(--or-accent);
}
.or-stage {
  position: relative;
  flex: 1;
  min-width: 0;
}
.or-canvas {
  position: absolute;
  inset: 16px;
  width: calc(100% - 32px);
  height: calc(100% - 32px);
}
.or-bg-dark {
  background: #101010;
}
.or-bg-light {
  background: #f4f4f4;
}
.or-bg-checker {
  background-image: linear-gradient(45deg, #2a2a2a 25%, transparent 25%, transparent 75%, #2a2a2a 75%),
    linear-gradient(45deg, #2a2a2a 25%, transparent 25%, transparent 75%, #2a2a2a 75%);
  background-size: 16px 16px;
  background-position: 0 0, 8px 8px;
}
.or-message {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  color: #ffb4b4;
  pointer-events: none;
}
.or-side {
  width: 280px;
  flex-shrink: 0;
  overflow: auto;
  padding: 12px;
  border-left: 1px solid var(--or-line);
  background: var(--or-bg2);
}
.or-label {
  margin: 12px 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--or-text2);
}
.or-label:first-child {
  margin-top: 0;
}
.or-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.or-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.or-type {
  color: var(--or-text2);
  font-size: 11px;
}
.or-check {
  width: 15px;
  height: 15px;
}
.or-color {
  width: 40px;
  height: 24px;
  background: none;
  border: 1px solid var(--or-line);
  border-radius: 4px;
}
.or-event {
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--or-text2);
  user-select: text;
}
@media (max-width: 720px) {
  .or-body {
    flex-direction: column;
  }
  .or-side {
    width: auto;
    max-height: 40%;
    border-left: 0;
    border-top: 1px solid var(--or-line);
  }
}
`;

function indexHtml(manifest: BundleManifest) {
  const title = manifest.name.replace(/[<>&]/g, '');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — Rive preview</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import { mountPreview } from './index.js';
      mountPreview(document.getElementById('app'));
    </script>
  </body>
</html>
`;
}

function readme(manifest: BundleManifest) {
  const scenes = manifest.artboards
    .map((a) => {
      const sm = a.stateMachines.length ? `state machines: ${a.stateMachines.map((m) => m.name).join(', ')}` : 'no state machines';
      const tl = a.timelines.length ? `timelines: ${a.timelines.map((t) => t.name).join(', ')}` : 'no timelines';
      return `- **${a.name}** ${a.width}×${a.height} — ${sm}; ${tl}`;
    })
    .join('\n');
  const runtimeNote =
    manifest.runtime === 'offline'
      ? `The Rive runtime (\`runtime/canvas_advanced.mjs\` + \`runtime/rive.wasm\`, version ${manifest.runtimeVersion}) ships in this folder, so the bundle plays with no network access.`
      : `The Rive runtime is loaded from unpkg (\`@rive-app/canvas-advanced@${manifest.runtimeVersion}\`), so this bundle needs internet access. Export the offline flavour to make it self-contained.`;
  return `# ${manifest.name} — Rive preview bundle

Exported from OpenRive. Everything needed to play \`${manifest.file}\` in a browser is in this folder.

## Run it

Browsers block module and \`fetch\` loads from \`file://\`, so serve the folder:

\`\`\`bash
npx --yes serve .          # or: python3 -m http.server 8000
\`\`\`

Then open the printed URL and you get the same preview as in the editor: artboard and
state machine pickers, inputs, data bound properties and an event log.

## What is in here

| File | Purpose |
| --- | --- |
| \`index.html\` | The preview page |
| \`index.js\` | The player — \`mountPreview()\` for the whole UI, \`createPlayer()\` for just the canvas |
| \`styles.css\` | Styling for the preview UI |
| \`${manifest.file}\` | The animation |
${manifest.runtime === 'offline' ? '| `runtime/` | The Rive WASM runtime |\n' : ''}
## Scenes

${scenes || '- (no artboards)'}

## Embed it in your own page

\`\`\`html
<canvas id="rive" style="width: 480px; height: 360px"></canvas>
<script type="module">
  import { createPlayer } from './index.js';
  const player = await createPlayer({ canvas: document.getElementById('rive') });
  // player.setInput('Hover', true);
  // player.setProperty('Label', 'string', 'Hello');
  // player.dispose();
</script>
\`\`\`

## Runtime

${runtimeNote}
`;
}

function packageJson(manifest: BundleManifest) {
  return `${JSON.stringify(
    {
      name: slug(manifest.name),
      version: '1.0.0',
      private: true,
      type: 'module',
      description: `Standalone Rive preview for ${manifest.name}, exported from OpenRive`,
      main: 'index.js',
      scripts: { start: 'npx --yes serve .' },
      files: ['index.html', 'index.js', 'styles.css', manifest.file, ...(manifest.runtime === 'offline' ? ['runtime'] : [])],
    },
    null,
    2,
  )}\n`;
}

/** The files that make up a preview bundle, in zip order. */
export function bundleFiles(opts: BundleOptions): BundleFile[] {
  const manifest = bundleManifest(opts);
  const files: BundleFile[] = [
    textFile('index.html', indexHtml(manifest)),
    textFile('index.js', indexJs(manifest)),
    textFile('styles.css', STYLES_CSS),
    textFile('README.md', readme(manifest)),
    textFile('package.json', packageJson(manifest)),
    { name: manifest.file, data: opts.riv },
  ];
  if (manifest.runtime === 'offline') {
    for (const f of opts.runtimeFiles ?? []) files.push({ name: `runtime/${f.name.split('/').pop()}`, data: f.data });
  }
  return files;
}

/** Builds the bundle as a .zip. */
export function buildBundle(opts: BundleOptions): Uint8Array<ArrayBuffer> {
  return zip(bundleFiles(opts), opts.modified);
}

/** File name to offer the bundle under. */
export function bundleFileName(name: string) {
  return `${slug(name)}-preview.zip`;
}

// ---------------------------------------------------------------------------
// A tiny zip writer (stored entries, no compression) so no dependency is needed.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosStamp(d: Date) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Packs files into an uncompressed zip archive. */
export function zip(files: BundleFile[], modified = new Date()): Uint8Array<ArrayBuffer> {
  const entries = files.map((f) => ({ name: enc.encode(f.name), data: f.data, crc: crc32(f.data) }));
  const localSize = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const { time, date } = dosStamp(modified);
  const offsets: number[] = [];
  let p = 0;
  for (const e of entries) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true); // version needed
    view.setUint16(p + 6, 0, true); // flags
    view.setUint16(p + 8, 0, true); // stored, not deflated
    view.setUint16(p + 10, time, true);
    view.setUint16(p + 12, date, true);
    view.setUint32(p + 14, e.crc, true);
    view.setUint32(p + 18, e.data.length, true);
    view.setUint32(p + 22, e.data.length, true);
    view.setUint16(p + 26, e.name.length, true);
    view.setUint16(p + 28, 0, true); // extra
    p += 30;
    out.set(e.name, p);
    p += e.name.length;
    out.set(e.data, p);
    p += e.data.length;
  }
  const centralStart = p;
  entries.forEach((e, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true); // version made by
    view.setUint16(p + 6, 20, true); // version needed
    view.setUint16(p + 8, 0, true); // flags
    view.setUint16(p + 10, 0, true); // stored
    view.setUint16(p + 12, time, true);
    view.setUint16(p + 14, date, true);
    view.setUint32(p + 16, e.crc, true);
    view.setUint32(p + 20, e.data.length, true);
    view.setUint32(p + 24, e.data.length, true);
    view.setUint16(p + 28, e.name.length, true);
    view.setUint16(p + 30, 0, true); // extra
    view.setUint16(p + 32, 0, true); // comment
    view.setUint16(p + 34, 0, true); // disk
    view.setUint16(p + 36, 0, true); // internal attrs
    view.setUint32(p + 38, 0, true); // external attrs
    view.setUint32(p + 42, offsets[i]!, true);
    p += 46;
    out.set(e.name, p);
    p += e.name.length;
  });
  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 4, 0, true); // this disk
  view.setUint16(p + 6, 0, true); // disk with the central directory
  view.setUint16(p + 8, entries.length, true);
  view.setUint16(p + 10, entries.length, true);
  view.setUint32(p + 12, p - centralStart, true);
  view.setUint32(p + 16, centralStart, true);
  view.setUint16(p + 20, 0, true); // comment
  return out;
}
