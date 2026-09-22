'use client';
import { create } from 'zustand';
import { produce, enableMapSet, setAutoFreeze } from 'immer';
import { ArtboardDoc, CoreObj, RiveDoc } from '@openrive/rive/document';
import { EASE_PRESETS, findArtboard, findObj, isAnimatable, keyframeAt, setInterpolation, upsertKeyframe } from '@openrive/rive/ops';
import { bindColor } from '@openrive/rive/theme';
import { getPrefs } from '../client/prefs';
import { prop } from '@openrive/rive/scene';

enableMapSet();
setAutoFreeze(false);

export type Mode = 'design' | 'animate';
export type Tool =
  | 'select'
  | 'artboard'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'polygon'
  | 'star'
  | 'text'
  | 'pen'
  | 'hand'
  | 'group';

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export type SmSelection =
  | { kind: 'state'; id: string }
  | { kind: 'transition'; id: string }
  | { kind: 'input'; id: string }
  | { kind: 'listener'; id: string }
  | null;

interface EditorState {
  projectId: string | null;
  projectName: string;
  readOnly: boolean;
  doc: RiveDoc | null;
  past: RiveDoc[];
  future: RiveDoc[];
  version: number;
  savedVersion: number;
  gestureStart: RiveDoc | null;

  mode: Mode;
  tool: Tool;
  activeArtboardId: string | null;
  selection: string[];
  hoverId: string | null;
  animationId: string | null;
  stateMachineId: string | null;
  layerId: string | null;
  frame: number;
  playing: boolean;
  /** state machine preview running on the stage */
  previewing: boolean;
  selectedKeyframes: string[];
  smSelection: SmSelection;
  view: View;
  editPathId: string | null;
  timelineHeight: number;
  /** ping-pong playback direction */
  playDir: 1 | -1;
  /** text object being edited inline on the stage */
  editTextId: string | null;
  leftTab: 'layers' | 'theme' | 'assets';
  /** the Code panel (scripts + embed snippets) is open */
  codeOpen: boolean;

  load(projectId: string, name: string, doc: RiveDoc, readOnly: boolean): void;
  /** Applies a mutation. Transient updates (during drags) don't create history entries. */
  commit(recipe: (doc: RiveDoc) => void, transient?: boolean): void;
  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  markSaved(version: number): void;
  /** Replaces the document with a newer version from disk, keeping view state. */
  replaceDoc(doc: RiveDoc, name?: string): void;
  setProjectName(name: string): void;

  set<K extends keyof EditorState>(key: K, value: EditorState[K]): void;
  setMode(mode: Mode): void;
  select(ids: string[], additive?: boolean): void;
  setActiveArtboard(id: string): void;
  setAnimation(id: string | null): void;
  setStateMachine(id: string | null): void;
  setFrame(frame: number): void;

  /** Sets a property; in animate mode animatable properties are keyed at the playhead. */
  setProps(objId: string, values: Record<string, unknown>, transient?: boolean): void;
  /** Sets a color and binds it to a theme swatch (or unbinds with null). */
  setColor(objId: string, prop: string, value: number, swatchId: string | null, transient?: boolean): void;
}

const HISTORY_LIMIT = 200;

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  projectName: '',
  readOnly: false,
  doc: null,
  past: [],
  future: [],
  version: 0,
  savedVersion: 0,
  gestureStart: null,
  mode: 'design',
  tool: 'select',
  activeArtboardId: null,
  selection: [],
  hoverId: null,
  animationId: null,
  stateMachineId: null,
  layerId: null,
  frame: 0,
  playing: false,
  previewing: false,
  selectedKeyframes: [],
  smSelection: null,
  view: { zoom: 1, panX: 0, panY: 0 },
  editPathId: null,
  timelineHeight: 280,
  playDir: 1,
  editTextId: null,
  leftTab: 'layers',
  codeOpen: false,

  load(projectId, name, doc, readOnly) {
    const ab = doc.artboards[0];
    set({
      projectId,
      projectName: name,
      readOnly,
      doc,
      past: [],
      future: [],
      version: 1,
      savedVersion: 1,
      mode: 'design',
      tool: 'select',
      activeArtboardId: ab?.id ?? null,
      selection: [],
      animationId: ab?.animations[0]?.id ?? null,
      stateMachineId: null,
      layerId: null,
      frame: 0,
      playing: false,
      previewing: false,
      selectedKeyframes: [],
      smSelection: null,
      editPathId: null,
    });
  },

  commit(recipe, transient = false) {
    const { doc, readOnly, gestureStart } = get();
    if (!doc || readOnly) return;
    const next = produce(doc, recipe);
    if (next === doc) return;
    if (transient || gestureStart) {
      set({ doc: next, version: get().version + 1 });
    } else {
      set({
        doc: next,
        past: [...get().past, doc].slice(-HISTORY_LIMIT),
        future: [],
        version: get().version + 1,
      });
    }
  },
  beginGesture() {
    const { doc, gestureStart } = get();
    if (!gestureStart && doc) set({ gestureStart: doc });
  },
  endGesture() {
    const { gestureStart, doc } = get();
    if (!gestureStart) return;
    if (doc && doc !== gestureStart) {
      set({ past: [...get().past, gestureStart].slice(-HISTORY_LIMIT), future: [], gestureStart: null });
    } else {
      set({ gestureStart: null });
    }
  },
  undo() {
    const { past, doc, future } = get();
    if (!past.length || !doc) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], version: get().version + 1 });
    get().select(get().selection.filter((id) => !!findInDoc(prev, id)));
  },
  redo() {
    const { past, doc, future } = get();
    if (!future.length || !doc) return;
    const next = future[0];
    set({ doc: next, past: [...past, doc], future: future.slice(1), version: get().version + 1 });
  },
  markSaved(version) {
    set({ savedVersion: version });
  },
  replaceDoc(doc, name) {
    const st = get();
    const exists = (id: string) => !!findInDoc(doc, id);
    const ab = doc.artboards.find((a) => a.id === st.activeArtboardId) ?? doc.artboards[0];
    const v = st.version + 1;
    set({
      doc,
      projectName: name ?? st.projectName,
      past: [],
      future: [],
      version: v,
      savedVersion: v,
      gestureStart: null,
      activeArtboardId: ab?.id ?? null,
      selection: st.selection.filter(exists),
      animationId: ab?.animations.some((a) => a.id === st.animationId) ? st.animationId : ab?.animations[0]?.id ?? null,
      stateMachineId: ab?.stateMachines.some((m) => m.id === st.stateMachineId) ? st.stateMachineId : null,
      selectedKeyframes: [],
      smSelection: null,
      editPathId: null,
      editTextId: null,
    });
  },
  setProjectName(name) {
    set({ projectName: name });
  },

  set(key, value) {
    set({ [key]: value } as Partial<EditorState>);
  },
  setMode(mode) {
    const { doc, activeArtboardId, animationId } = get();
    const ab = doc ? findArtboard(doc, activeArtboardId) : undefined;
    set({
      mode,
      playing: false,
      previewing: false,
      tool: 'select',
      animationId: mode === 'animate' ? animationId ?? ab?.animations[0]?.id ?? null : animationId,
      stateMachineId: null,
      frame: mode === 'animate' ? get().frame : 0,
      selectedKeyframes: [],
    });
  },
  select(ids, additive = false) {
    const cur = get().selection;
    if (additive) {
      const s = new Set(cur);
      for (const id of ids) {
        if (s.has(id)) s.delete(id);
        else s.add(id);
      }
      set({ selection: [...s] });
    } else {
      set({ selection: ids });
    }
    if (get().editPathId && !get().selection.includes(get().editPathId!)) set({ editPathId: null });
  },
  setActiveArtboard(id) {
    const { doc, activeArtboardId } = get();
    if (id === activeArtboardId) return;
    const ab = doc ? findArtboard(doc, id) : undefined;
    set({
      activeArtboardId: id,
      animationId: ab?.animations[0]?.id ?? null,
      stateMachineId: null,
      layerId: null,
      frame: 0,
      playing: false,
      previewing: false,
      selectedKeyframes: [],
      smSelection: null,
      editPathId: null,
    });
  },
  setAnimation(id) {
    set({ animationId: id, stateMachineId: null, frame: 0, playing: false, previewing: false, selectedKeyframes: [] });
  },
  setStateMachine(id) {
    const { doc, activeArtboardId } = get();
    const ab = doc ? findArtboard(doc, activeArtboardId) : undefined;
    const sm = ab?.stateMachines.find((s) => s.id === id);
    const layer = sm?.children?.find((c) => c.type === 'StateMachineLayer');
    set({ stateMachineId: id, layerId: layer?.id ?? null, playing: false, smSelection: null });
  },
  setFrame(frame) {
    set({ frame: Math.max(0, Math.round(frame)) });
  },

  setProps(objId, values, transient = false) {
    const { mode, animationId, frame, activeArtboardId } = get();
    get().commit((doc) => {
      const ab = findArtboard(doc, activeArtboardId);
      if (!ab) return;
      const o = findObj(ab, objId);
      if (!o) return;
      const anim = mode === 'animate' && animationId ? ab.animations.find((a) => a.id === animationId) : undefined;
      const prefs = getPrefs();
      for (const [k, v] of Object.entries(values)) {
        if (anim && isAnimatable(o.type, k)) {
          const isNew = !keyframeAt(anim, o.id, o.type, k, frame);
          const hadKeys = !!anim.children?.some((ko) => ko.props.objectId === o.id && ko.children?.length);
          const kf = upsertKeyframe(anim, o, k, v, frame);
          // brand new tracks use the preferred interpolation; later keys inherit from their neighbour
          if (kf && isNew && !hadKeys && prefs.keyInterpolation !== 'linear') {
            setInterpolation(ab, [kf], prefs.keyInterpolation, EASE_PRESETS[prefs.keyEase] ?? EASE_PRESETS['Ease In Out']);
          }
        } else o.props[k] = v;
      }
    }, transient);
  },

  setColor(objId, propName, value, swatchId, transient = false) {
    const { mode, animationId, frame, activeArtboardId } = get();
    get().commit((doc) => {
      const ab = findArtboard(doc, activeArtboardId);
      const o = ab && findObj(ab, objId);
      if (!ab || !o) return;
      const anim = mode === 'animate' && animationId ? ab.animations.find((a) => a.id === animationId) : undefined;
      if (anim && isAnimatable(o.type, propName)) {
        const kf = upsertKeyframe(anim, o, propName, value >>> 0, frame);
        if (kf) bindColor(kf, 'value', swatchId);
      } else {
        o.props[propName] = value >>> 0;
        bindColor(o, propName, swatchId);
      }
    }, transient);
  },
}));

function findInDoc(doc: RiveDoc, id: string): CoreObj | undefined {
  for (const ab of doc.artboards) {
    const o = findObj(ab, id);
    if (o) return o;
  }
  return undefined;
}

// Convenience selectors ------------------------------------------------------

export function useActiveArtboard(): ArtboardDoc | undefined {
  return useEditor((s) => (s.doc ? findArtboard(s.doc, s.activeArtboardId) : undefined));
}

export function useActiveAnimation(): CoreObj | undefined {
  return useEditor((s) => {
    const ab = s.doc ? findArtboard(s.doc, s.activeArtboardId) : undefined;
    return ab?.animations.find((a) => a.id === s.animationId);
  });
}

export function getActive() {
  const s = useEditor.getState();
  const ab = s.doc ? findArtboard(s.doc, s.activeArtboardId) : undefined;
  const anim = ab?.animations.find((a) => a.id === s.animationId);
  return { s, ab, anim };
}

export function animationFrames(anim: CoreObj) {
  return {
    fps: prop(anim, 'fps') || 60,
    duration: prop(anim, 'duration') || 60,
    loop: prop(anim, 'loopValue'),
    speed: prop(anim, 'speed') || 1,
    workStart: prop(anim, 'workStart'),
    workEnd: prop(anim, 'workEnd'),
    enableWorkArea: prop<boolean>(anim, 'enableWorkArea'),
  };
}

// handy for debugging in development: window.__riveEditor.getState()
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as { __riveEditor: typeof useEditor }).__riveEditor = useEditor;
}
