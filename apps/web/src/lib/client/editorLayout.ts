'use client';

import { create } from 'zustand';

export const EDITOR_LAYOUT_DEFAULTS = {
  leftSidebarWidth: 240,
  rightInspectorWidth: 272,
  leftSidebarCollapsed: false,
  rightInspectorCollapsed: false,
};

const STORAGE_KEY = 'openrive:editor-layout';
const MIN_LEFT_WIDTH = 180;
const MAX_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 220;
const MAX_RIGHT_WIDTH = 420;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EDITOR_LAYOUT_DEFAULTS;
    const saved = JSON.parse(raw) as Partial<typeof EDITOR_LAYOUT_DEFAULTS>;
    return {
      leftSidebarWidth: clamp(saved.leftSidebarWidth ?? EDITOR_LAYOUT_DEFAULTS.leftSidebarWidth, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH),
      rightInspectorWidth: clamp(saved.rightInspectorWidth ?? EDITOR_LAYOUT_DEFAULTS.rightInspectorWidth, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH),
      leftSidebarCollapsed: saved.leftSidebarCollapsed ?? EDITOR_LAYOUT_DEFAULTS.leftSidebarCollapsed,
      rightInspectorCollapsed: saved.rightInspectorCollapsed ?? EDITOR_LAYOUT_DEFAULTS.rightInspectorCollapsed,
    };
  } catch {
    return EDITOR_LAYOUT_DEFAULTS;
  }
}

function saveLayout(state: Pick<EditorLayoutState, 'leftSidebarWidth' | 'rightInspectorWidth' | 'leftSidebarCollapsed' | 'rightInspectorCollapsed'>) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        leftSidebarWidth: state.leftSidebarWidth,
        rightInspectorWidth: state.rightInspectorWidth,
        leftSidebarCollapsed: state.leftSidebarCollapsed,
        rightInspectorCollapsed: state.rightInspectorCollapsed,
      }),
    );
  } catch {
    /* storage unavailable */
  }
}

export interface EditorLayoutState {
  leftSidebarWidth: number;
  rightInspectorWidth: number;
  leftSidebarCollapsed: boolean;
  rightInspectorCollapsed: boolean;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  loaded: boolean;
  init(): void;
  setLeftSidebarWidth(width: number): void;
  setRightInspectorWidth(width: number): void;
  resetLeftSidebarWidth(): void;
  resetRightInspectorWidth(): void;
  toggleLeftSidebar(): void;
  toggleRightInspector(): void;
  openLeftDrawer(): void;
  closeLeftDrawer(): void;
  openRightDrawer(): void;
  closeRightDrawer(): void;
  reset(): void;
}

export const useEditorLayout = create<EditorLayoutState>((set, get) => ({
  ...EDITOR_LAYOUT_DEFAULTS,
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  loaded: false,

  init() {
    if (get().loaded) return;
    set({ ...readLayout(), loaded: true });
  },

  setLeftSidebarWidth(width) {
    const next = { leftSidebarWidth: clamp(width, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH) };
    set(next);
    saveLayout({ ...get(), ...next });
  },

  setRightInspectorWidth(width) {
    const next = { rightInspectorWidth: clamp(width, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH) };
    set(next);
    saveLayout({ ...get(), ...next });
  },

  resetLeftSidebarWidth() {
    const next = { leftSidebarWidth: EDITOR_LAYOUT_DEFAULTS.leftSidebarWidth };
    set(next);
    saveLayout({ ...get(), ...next });
  },

  resetRightInspectorWidth() {
    const next = { rightInspectorWidth: EDITOR_LAYOUT_DEFAULTS.rightInspectorWidth };
    set(next);
    saveLayout({ ...get(), ...next });
  },

  toggleLeftSidebar() {
    const leftSidebarCollapsed = !get().leftSidebarCollapsed;
    const next = { leftSidebarCollapsed, leftDrawerOpen: !leftSidebarCollapsed };
    set(next);
    saveLayout({ ...get(), ...next });
  },

  toggleRightInspector() {
    const rightInspectorCollapsed = !get().rightInspectorCollapsed;
    const next = { rightInspectorCollapsed, rightDrawerOpen: !rightInspectorCollapsed };
    set(next);
    saveLayout({ ...get(), ...next });
  },

  openLeftDrawer() {
    set({ leftDrawerOpen: true });
  },

  closeLeftDrawer() {
    set({ leftDrawerOpen: false });
  },

  openRightDrawer() {
    set({ rightDrawerOpen: true });
  },

  closeRightDrawer() {
    set({ rightDrawerOpen: false });
  },

  reset() {
    set({ ...EDITOR_LAYOUT_DEFAULTS, leftDrawerOpen: false, rightDrawerOpen: false });
    saveLayout({ ...get(), ...EDITOR_LAYOUT_DEFAULTS });
  },
}));

export const EDITOR_LAYOUT_LIMITS = {
  minLeftWidth: MIN_LEFT_WIDTH,
  maxLeftWidth: MAX_LEFT_WIDTH,
  minRightWidth: MIN_RIGHT_WIDTH,
  maxRightWidth: MAX_RIGHT_WIDTH,
};
