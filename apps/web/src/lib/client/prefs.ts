'use client';
// Editing defaults ("presets") and custom shortcut bindings, saved per browser.
import { create } from 'zustand';

export interface Prefs {
  /** 'palette' cycles through a color palette for new shapes, 'fixed' uses shapeFill */
  shapeFillMode: 'palette' | 'fixed';
  shapeFill: number;
  /** add a stroke to new shapes */
  shapeStroke: boolean;
  strokeColor: number;
  strokeWidth: number;
  textColor: number;
  textSize: number;
  /** interpolation for newly created keyframes */
  keyInterpolation: 'hold' | 'linear' | 'cubic';
  keyEase: string;
  nudge: number;
  bigNudge: number;
  /** round positions to whole pixels while dragging */
  snapToPixel: boolean;
  /** what a click on the canvas picks: the whole group, or the object under the cursor */
  selectMode: 'group' | 'object';
  /** action id -> key combos, overriding the defaults */
  shortcuts: Record<string, string[]>;
}

export const DEFAULT_PREFS: Prefs = {
  shapeFillMode: 'palette',
  shapeFill: 0xffc4c4c4,
  shapeStroke: false,
  strokeColor: 0xffffffff,
  strokeWidth: 2,
  textColor: 0xffffffff,
  textSize: 32,
  keyInterpolation: 'linear',
  keyEase: 'Ease In Out',
  nudge: 1,
  bigNudge: 10,
  snapToPixel: false,
  selectMode: 'group',
  shortcuts: {},
};

const KEY = 'openrive:prefs';

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_PREFS };
}

interface PrefsState {
  prefs: Prefs;
  loaded: boolean;
  init(): void;
  update(patch: Partial<Prefs>): void;
  reset(): void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: { ...DEFAULT_PREFS },
  loaded: false,
  init() {
    if (!get().loaded) set({ prefs: load(), loaded: true });
  },
  update(patch) {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  },
  reset() {
    set({ prefs: { ...DEFAULT_PREFS } });
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  },
}));

export const getPrefs = () => usePrefs.getState().prefs;
