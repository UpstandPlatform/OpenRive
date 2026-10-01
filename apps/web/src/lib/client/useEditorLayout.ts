'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EDITOR_LAYOUT_LIMITS, useEditorLayout } from './editorLayout';

export type EditorLayoutMode = 'wide' | 'compact';

export function useEditorToolbarLayout() {
  const leftCollapsed = useEditorLayout((s) => s.leftSidebarCollapsed);
  const leftDrawerOpen = useEditorLayout((s) => s.leftDrawerOpen);
  const [mode, setMode] = useState<EditorLayoutMode>('wide');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 959px)');
    const update = () => setMode(media.matches ? 'compact' : 'wide');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const toggleLeftSidebar = useEditorLayout((s) => s.toggleLeftSidebar);
  const openLeftDrawer = useEditorLayout((s) => s.openLeftDrawer);
  const closeLeftDrawer = useEditorLayout((s) => s.closeLeftDrawer);

  return {
    compact: mode === 'compact',
    leftOpen: mode === 'compact' ? leftDrawerOpen : !leftCollapsed,
    toggleLeftSidebar: () => {
      if (mode === 'compact') {
        if (leftDrawerOpen) closeLeftDrawer();
        else openLeftDrawer();
      } else {
        toggleLeftSidebar();
      }
    },
  };
}

export function useEditorLayoutController() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const leftWidth = useEditorLayout((s) => s.leftSidebarWidth);
  const rightWidth = useEditorLayout((s) => s.rightInspectorWidth);
  const loaded = useEditorLayout((s) => s.loaded);
  const leftCollapsed = useEditorLayout((s) => s.leftSidebarCollapsed);
  const rightCollapsed = useEditorLayout((s) => s.rightInspectorCollapsed);
  const leftDrawerOpen = useEditorLayout((s) => s.leftDrawerOpen);
  const rightDrawerOpen = useEditorLayout((s) => s.rightDrawerOpen);
  const setLeftWidth = useEditorLayout((s) => s.setLeftSidebarWidth);
  const setRightWidth = useEditorLayout((s) => s.setRightInspectorWidth);
  const resetLeftWidth = useEditorLayout((s) => s.resetLeftSidebarWidth);
  const resetRightWidth = useEditorLayout((s) => s.resetRightInspectorWidth);
  const closeLeftDrawer = useEditorLayout((s) => s.closeLeftDrawer);
  const closeRightDrawer = useEditorLayout((s) => s.closeRightDrawer);

  useEffect(() => {
    useEditorLayout.getState().init();
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const update = () => setContainerWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const mode: EditorLayoutMode = containerWidth !== null && containerWidth < 960 ? 'compact' : 'wide';
  const leftOpen = mode === 'wide' ? !leftCollapsed : leftDrawerOpen;
  const rightOpen = mode === 'wide' ? !rightCollapsed : rightDrawerOpen;

  useEffect(() => {
    if (mode === 'compact') {
      // A wide-layout panel should not unexpectedly become an open drawer just
      // because the window was resized below the compact breakpoint.
      closeLeftDrawer();
      closeRightDrawer();
    }
  }, [closeLeftDrawer, closeRightDrawer, mode]);

  const startResize = useCallback(
    (side: 'left' | 'right', event: React.PointerEvent<HTMLButtonElement>) => {
      if (mode !== 'wide') return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = side === 'left' ? leftWidth : rightWidth;
      const move = (nextEvent: PointerEvent) => {
        const delta = nextEvent.clientX - startX;
        if (side === 'left') setLeftWidth(startWidth + delta);
        else setRightWidth(startWidth - delta);
      };
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    },
    [leftWidth, mode, rightWidth, setLeftWidth, setRightWidth],
  );

  const adjustSize = useCallback(
    (side: 'left' | 'right', delta: number) => {
      if (side === 'left') setLeftWidth(leftWidth + delta);
      else setRightWidth(rightWidth - delta);
    },
    [leftWidth, rightWidth, setLeftWidth, setRightWidth],
  );

  const onSplitterKeyDown = useCallback(
    (side: 'left' | 'right', event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        adjustSize(side, event.key === 'ArrowRight' ? 16 : -16);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        if (side === 'left') setLeftWidth(EDITOR_LAYOUT_LIMITS.minLeftWidth);
        else setRightWidth(EDITOR_LAYOUT_LIMITS.minRightWidth);
      }
      if (event.key === 'End') {
        event.preventDefault();
        if (side === 'left') setLeftWidth(EDITOR_LAYOUT_LIMITS.maxLeftWidth);
        else setRightWidth(EDITOR_LAYOUT_LIMITS.maxRightWidth);
      }
    },
    [adjustSize, setLeftWidth, setRightWidth],
  );

  const resetSize = useCallback(
    (side: 'left' | 'right') => {
      if (side === 'left') resetLeftWidth();
      else resetRightWidth();
    },
    [resetLeftWidth, resetRightWidth],
  );

  return {
    rootRef,
    mode,
    loaded,
    leftWidth,
    rightWidth,
    leftOpen,
    rightOpen,
    leftDrawerOpen,
    rightDrawerOpen,
    startResize,
    onSplitterKeyDown,
    resetSize,
    toggleLeftSidebar: useEditorLayout((s) => s.toggleLeftSidebar),
    toggleRightInspector: useEditorLayout((s) => s.toggleRightInspector),
    openLeftDrawer: useEditorLayout((s) => s.openLeftDrawer),
    closeLeftDrawer,
    openRightDrawer: useEditorLayout((s) => s.openRightDrawer),
    closeRightDrawer,
  };
}
