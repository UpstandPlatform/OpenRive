'use client';
// Renders the edited document with the official Rive runtime. The document is
// exported to .riv bytes and loaded into the runtime whenever it changes, so
// what you see on the stage is exactly what a Rive player will show.
import type {
  Artboard,
  File as RiveFile,
  LinearAnimationInstance,
  RiveCanvas,
  StateMachineInstance,
  WrappedRenderer,
} from '@rive-app/canvas-advanced';
import { exportRiv, RiveDoc } from './document';
import { loadRuntime } from './runtime';

export interface EngineFrameState {
  mode: 'design' | 'animate';
  activeArtboardIndex: number;
  animationIndex: number; // -1 = none
  time: number; // seconds
  previewStateMachineIndex: number; // -1 = not previewing
  view: { zoom: number; panX: number; panY: number };
  /** artboard stage positions, top-left */
  positions: { x: number; y: number }[];
}

export interface PreviewInput {
  name: string;
  type: 'number' | 'bool' | 'trigger';
  value: number | boolean;
}

type Listener = () => void;

export class StageEngine {
  private rive: RiveCanvas | null = null;
  private renderer: WrappedRenderer | null = null;
  private file: RiveFile | null = null;
  private artboards: Artboard[] = [];
  private anim: LinearAnimationInstance | null = null;
  private sm: StateMachineInstance | null = null;
  private instanceKey = '';
  private rafId = 0;
  private lastTime = 0;
  private loading = false;
  private pendingDoc: RiveDoc | null = null;
  private disposed = false;
  private listeners = new Set<Listener>();
  private inputPoll = 0;

  error: string | null = null;
  ready = false;
  inputs: PreviewInput[] = [];
  events: { name: string; time: number }[] = [];
  /** called every frame with the elapsed seconds before rendering */
  onTick: ((dt: number) => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private getState: () => EngineFrameState,
  ) {}

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  async init() {
    try {
      this.rive = await loadRuntime();
    } catch (e) {
      this.error = `Failed to load the Rive runtime: ${(e as Error).message}`;
      this.emit();
      return;
    }
    if (this.disposed) return;
    this.renderer = this.rive.makeRenderer(this.canvas);
    this.ready = true;
    const loop = (t: number) => {
      if (this.disposed) return;
      const dt = this.lastTime ? Math.min(0.1, (t - this.lastTime) / 1000) : 0;
      this.lastTime = t;
      this.onTick?.(dt);
      this.render(dt);
      this.rafId = this.rive!.requestAnimationFrame(loop);
    };
    this.rafId = this.rive.requestAnimationFrame(loop);
    if (this.pendingDoc) {
      const d = this.pendingDoc;
      this.pendingDoc = null;
      this.setDoc(d);
    }
    this.emit();
  }

  /** Queues the document for (re)loading. Loads are coalesced. */
  setDoc(doc: RiveDoc) {
    if (!this.rive || this.loading) {
      this.pendingDoc = doc;
      return;
    }
    this.loading = true;
    let bytes: Uint8Array;
    try {
      bytes = exportRiv(doc);
    } catch (e) {
      this.error = `Export failed: ${(e as Error).message}`;
      this.loading = false;
      this.emit();
      return;
    }
    this.rive
      .load(bytes, undefined, false)
      .then((file) => {
        if (this.disposed) {
          file.unref?.();
          return;
        }
        this.releaseInstances();
        this.file?.unref?.();
        this.file = file;
        const count = file.artboardCount();
        this.artboards = [];
        for (let i = 0; i < count; i++) {
          const ab = file.artboardByIndex(i);
          this.artboards.push(ab);
          this.bindViewModel(ab);
        }
        this.instanceKey = '';
        if (this.error) {
          this.error = null;
          this.emit();
        }
      })
      .catch((e) => {
        this.error = `The runtime rejected the file: ${(e as Error)?.message ?? e}`;
        this.emit();
      })
      .finally(() => {
        this.loading = false;
        if (this.pendingDoc) {
          const d = this.pendingDoc;
          this.pendingDoc = null;
          this.setDoc(d);
        }
      });
  }

  private releaseInstances() {
    this.anim?.delete();
    this.anim = null;
    this.sm?.delete();
    this.sm = null;
    for (const a of this.artboards) a.delete();
    this.artboards = [];
    this.inputs = [];
  }

  private refreshActive(state: EngineFrameState) {
    const key = `${state.activeArtboardIndex}|${state.mode}|${state.animationIndex}|${state.previewStateMachineIndex}`;
    if (key === this.instanceKey || !this.file) return;
    this.instanceKey = key;
    this.anim?.delete();
    this.anim = null;
    this.sm?.delete();
    this.sm = null;
    this.inputs = [];
    this.events = [];
    // fresh artboard instance = setup pose
    const i = state.activeArtboardIndex;
    if (i >= 0 && i < this.artboards.length) {
      this.artboards[i].delete();
      this.artboards[i] = this.file.artboardByIndex(i);
      const ab = this.artboards[i];
      if (state.previewStateMachineIndex < 0) this.bindViewModel(ab);
      if (state.previewStateMachineIndex >= 0 && state.previewStateMachineIndex < ab.stateMachineCount()) {
        this.sm = new this.rive!.StateMachineInstance(ab.stateMachineByIndex(state.previewStateMachineIndex), ab);
        this.bindViewModel(ab, this.sm);
        this.readInputs();
      } else if (state.mode === 'animate' && state.animationIndex >= 0 && state.animationIndex < ab.animationCount()) {
        this.anim = new this.rive!.LinearAnimationInstance(ab.animationByIndex(state.animationIndex), ab);
      }
    }
    this.emit();
  }

  /** Binds the artboard's default view model instance so data-bound files render and run. */
  private bindViewModel(ab: Artboard, sm?: StateMachineInstance) {
    if (!this.file) return;
    try {
      const vm = this.file.viewModelCount() > 0 ? this.file.defaultArtboardViewModel(ab) : null;
      const vmi = vm && (vm.defaultInstance() ?? vm.instance());
      if (!vmi) return;
      if (sm) sm.bindViewModelInstance(vmi);
      else ab.bindViewModelInstance(vmi);
    } catch {
      /* files without view models */
    }
  }

  private readInputs() {
    if (!this.sm || !this.rive) return;
    const out: PreviewInput[] = [];
    for (let k = 0; k < this.sm.inputCount(); k++) {
      const input = this.sm.input(k);
      const t = input.type;
      const type = t === this.rive.SMIInput.bool ? 'bool' : t === this.rive.SMIInput.number ? 'number' : 'trigger';
      out.push({ name: input.name, type, value: type === 'trigger' ? false : (input.value as number | boolean) });
    }
    this.inputs = out;
  }

  setInput(name: string, value: number | boolean) {
    if (!this.sm) return;
    for (let k = 0; k < this.sm.inputCount(); k++) {
      const input = this.sm.input(k);
      if (input.name !== name) continue;
      if (input.type === this.rive!.SMIInput.trigger) input.asTrigger().fire();
      else if (input.type === this.rive!.SMIInput.bool) input.asBool().value = !!value;
      else input.asNumber().value = Number(value);
    }
    this.readInputs();
    this.emit();
  }

  private viewMatrix(state: EngineFrameState, index: number): [number, number, number, number, number, number] {
    const dpr = window.devicePixelRatio || 1;
    const p = state.positions[index] ?? { x: 0, y: 0 };
    const z = state.view.zoom * dpr;
    return [z, 0, 0, z, (state.view.panX + p.x * state.view.zoom) * dpr, (state.view.panY + p.y * state.view.zoom) * dpr];
  }

  private render(dt: number) {
    const r = this.renderer;
    if (!r || !this.rive) return;
    r.clear();
    if (!this.file) return;
    const state = this.getState();
    this.refreshActive(state);
    for (let i = 0; i < this.artboards.length; i++) {
      const ab = this.artboards[i];
      const active = i === state.activeArtboardIndex;
      try {
        if (active && this.sm) {
          this.sm.advanceAndApply(dt);
          this.collectEvents();
        } else if (active && this.anim) {
          this.anim.time = state.time;
          this.anim.apply(1);
          ab.advance(0);
        } else {
          ab.advance(0);
        }
        // the canvas renderer's transform takes (a, b, c, d, e, f) like Canvas2D
        const m = this.viewMatrix(state, i);
        r.save();
        (r as unknown as { transform: (...m: number[]) => void }).transform(...m);
        ab.draw(r);
        r.restore();
      } catch (e) {
        this.error = `Render error: ${(e as Error).message}`;
      }
    }
  }

  private collectEvents() {
    if (!this.sm) return;
    const n = this.sm.reportedEventCount();
    for (let k = 0; k < n; k++) {
      const ev = this.sm.reportedEventAt(k);
      if (ev) this.events = [{ name: ev.name, time: Date.now() }, ...this.events].slice(0, 20);
    }
    // listeners can change inputs; refresh the live values shown in the UI (throttled)
    if (++this.inputPoll % 6 === 0 || n) {
      const before = JSON.stringify(this.inputs);
      this.readInputs();
      if (n || JSON.stringify(this.inputs) !== before) this.emit();
    }
  }

  /** Pointer events for state machine listeners, in artboard (top-left) space. */
  pointer(kind: 'down' | 'move' | 'up' | 'exit', x: number, y: number) {
    if (!this.sm) return;
    if (kind === 'down') this.sm.pointerDown(x, y, 0);
    else if (kind === 'move') this.sm.pointerMove(x, y, 0);
    else if (kind === 'up') this.sm.pointerUp(x, y, 0);
    else this.sm.pointerExit(x, y, 0);
  }

  get isPreviewing() {
    return !!this.sm;
  }

  dispose() {
    this.disposed = true;
    if (this.rive && this.rafId) this.rive.cancelAnimationFrame(this.rafId);
    this.releaseInstances();
    this.file?.unref?.();
    this.file = null;
    (this.renderer as { delete?: () => void } | null)?.delete?.();
    this.renderer = null;
  }
}

