'use client';

import { FileImage, GripVertical, Layers, Palette, PanelLeftClose, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Tabs } from '@openrive/ui';
import { useEditorLayoutController } from '@/lib/client/useEditorLayout';
import { AssetsPanel } from './AssetsPanel';
import { CodePanel } from './CodePanel';
import { Hierarchy } from './Hierarchy';
import { Inspector } from './Inspector';
import { Stage } from './Stage';
import { ThemePanel } from './ThemePanel';
import { AnimatePanel } from './Timeline';

type LeftTab = 'layers' | 'theme' | 'assets';

const leftTabs = [
  { id: 'layers' as const, label: 'Layers', icon: <Layers size={12} />, title: 'Layers (Alt+T to switch)' },
  { id: 'theme' as const, label: 'Theme', icon: <Palette size={12} />, title: 'Theme (Alt+T to switch)' },
  { id: 'assets' as const, label: 'Assets', icon: <FileImage size={12} />, title: 'Assets (Alt+T to switch)' },
];

interface EditorWorkspaceProps {
  mode: 'design' | 'animate';
  leftTab: LeftTab;
  codeOpen: boolean;
  onLeftTabChange: (tab: LeftTab) => void;
}

export function EditorWorkspace({ mode, leftTab, codeOpen, onLeftTabChange }: EditorWorkspaceProps) {
  const {
    rootRef,
    mode: layoutMode,
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
    toggleLeftSidebar,
    toggleRightInspector,
    openLeftDrawer,
    closeLeftDrawer,
    openRightDrawer,
    closeRightDrawer,
  } = useEditorLayoutController();

  const selectTab = (tab: LeftTab) => {
    onLeftTabChange(tab);
    if (layoutMode === 'compact') openLeftDrawer();
    else if (!leftOpen) toggleLeftSidebar();
  };

  const leftPanel = leftTab === 'layers' ? <Hierarchy /> : leftTab === 'theme' ? <ThemePanel /> : <AssetsPanel />;

  return (
    <div ref={rootRef} className={`editor-workspace editor-layout-${layoutMode} relative flex-1 flex min-h-0 min-w-0`} data-layout-loaded={loaded}>
      {layoutMode === 'compact' && (leftDrawerOpen || rightDrawerOpen) && (
        <button className="editor-drawer-backdrop" aria-label="Close open panel" onClick={() => (closeLeftDrawer(), closeRightDrawer())} />
      )}

      <aside
        className={`editor-sidebar editor-sidebar-left shrink-0 border-r border-line bg-bg1 flex flex-col ${leftOpen ? 'editor-panel-open' : 'editor-panel-collapsed'} ${layoutMode === 'compact' && leftDrawerOpen ? 'editor-drawer-open' : ''}`}
        style={{ width: layoutMode === 'wide' ? (leftOpen ? leftWidth : 48) : 48 }}
        aria-label="Layers, theme, and assets"
      >
        {leftOpen ? (
          <>
            <div className="editor-panel-tabs">
              <Tabs items={leftTabs} value={leftTab} onChange={selectTab} className="flex-1 min-w-0" />
            </div>
            {leftPanel}
          </>
        ) : (
          <div className="editor-panel-rail">
            {leftTabs.map((tab) => (
              <button
                key={tab.id}
                className={`icon-btn ${leftTab === tab.id ? 'active' : ''}`}
                title={`${tab.label} panel`}
                aria-label={`Open ${tab.label} panel`}
                onClick={() => selectTab(tab.id)}
              >
                {tab.icon}
              </button>
            ))}
          </div>
        )}
        {layoutMode === 'wide' && leftOpen && (
          <Splitter
            label="Resize left sidebar"
            value={leftWidth}
            min={180}
            max={360}
            onPointerDown={(event) => startResize('left', event)}
            onKeyDown={(event) => onSplitterKeyDown('left', event)}
            onDoubleClick={() => resetSize('left')}
          />
        )}
      </aside>

      <div className="editor-canvas-column flex-1 flex flex-col min-w-0 min-h-0">
        <Stage />
        {codeOpen && <CodePanel />}
        {mode === 'animate' && <AnimatePanel />}
      </div>

      <aside
        className={`editor-inspector shrink-0 border-l border-line bg-bg1 flex flex-col ${rightOpen ? 'editor-panel-open' : 'editor-panel-collapsed'} ${layoutMode === 'compact' && rightDrawerOpen ? 'editor-drawer-open' : ''}`}
        style={{ width: layoutMode === 'wide' ? (rightOpen ? rightWidth : 48) : 48 }}
        aria-label="Inspector"
      >
        {rightOpen ? (
          <>
            <div className="editor-inspector-header">
              <span className="panel-title flex-1">Inspector</span>
              <button className="icon-btn" title="Collapse inspector" aria-label="Collapse inspector" onClick={toggleRightInspector}>
                <PanelRightClose size={14} />
              </button>
            </div>
            <Inspector />
          </>
        ) : (
          <div className="editor-panel-rail editor-panel-rail-right">
            <button className="icon-btn" title="Expand inspector" aria-label="Expand inspector" onClick={() => (layoutMode === 'compact' ? openRightDrawer() : toggleRightInspector())}>
              <PanelRightOpen size={14} />
            </button>
          </div>
        )}
        {layoutMode === 'wide' && rightOpen && (
          <Splitter
            label="Resize inspector"
            value={rightWidth}
            min={220}
            max={420}
            onPointerDown={(event) => startResize('right', event)}
            onKeyDown={(event) => onSplitterKeyDown('right', event)}
            onDoubleClick={() => resetSize('right')}
            side="left"
          />
        )}
      </aside>

      {layoutMode === 'compact' && leftDrawerOpen && (
        <button className="editor-drawer-close" title="Close left panel" aria-label="Close left panel" onClick={closeLeftDrawer}>
          <PanelLeftClose size={14} />
        </button>
      )}
      {layoutMode === 'compact' && rightDrawerOpen && (
        <button className="editor-drawer-close editor-drawer-close-right" title="Close inspector" aria-label="Close inspector" onClick={closeRightDrawer}>
          <PanelRightClose size={14} />
        </button>
      )}
    </div>
  );
}

function Splitter({
  label,
  value,
  min,
  max,
  side = 'right',
  onPointerDown,
  onKeyDown,
  onDoubleClick,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  side?: 'left' | 'right';
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onDoubleClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`editor-splitter editor-splitter-${side}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      title={`${label}. Use arrow keys to resize.`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    >
      <GripVertical size={12} />
    </button>
  );
}
