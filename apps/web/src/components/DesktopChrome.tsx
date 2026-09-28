'use client';
// The window title bar for the desktop app.
//
// The desktop window is frameless (titleBarStyle: 'hidden'), so OpenRive draws
// its own bar: the app name, a Help menu and the minimise / maximise / close
// buttons. Dragging works through Electrobun's app-region CSS; the buttons and
// external links reach the native window through the small control server the
// desktop main process runs on 127.0.0.1.
//
// In an ordinary browser tab this renders nothing.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CircleHelp, Minus, Square, Copy as Restore, X } from 'lucide-react';
import { Popover } from '@openrive/ui';
import { AppIcon } from './AppHeader';

export const LINKS = {
  site: 'https://openrive.upstand.dev',
  repo: 'https://github.com/UpstandPlatform/OpenRive',
  docs: 'https://github.com/UpstandPlatform/OpenRive/wiki',
  issues: 'https://github.com/UpstandPlatform/OpenRive/issues/new/choose',
  releases: 'https://github.com/UpstandPlatform/OpenRive/releases',
  license: 'https://github.com/UpstandPlatform/OpenRive/blob/main/LICENSE',
};

interface Control {
  port: string;
  token: string;
}

const STORAGE_KEY = 'openrive:desktop-control';

/** Reads the control server details the desktop shell passes in the first URL. */
function readControl(): Control | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('desktop') === '1') {
    return { port: params.get('controlPort') ?? '', token: params.get('controlToken') ?? '' };
  }
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Control) : null;
  } catch {
    return null;
  }
}

/** False while rendering on the server, true once hydrated — no markup mismatch. */
const subscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/** Opens a link in the system browser when running in the desktop app. */
export function openExternal(url: string) {
  let control: Control | null = null;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    control = stored ? (JSON.parse(stored) as Control) : null;
  } catch {
    control = null;
  }
  if (control?.port) {
    void fetch(`http://127.0.0.1:${control.port}/open?token=${encodeURIComponent(control.token)}&url=${encodeURIComponent(url)}`).catch(() => {});
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function DesktopChrome() {
  const hydrated = useHydrated();
  // readControl() builds a new object each render, so keep the values instead
  const { port = '', token = '' } = (hydrated ? readControl() : null) ?? {};
  const control = useMemo(() => (port ? { port, token } : null), [port, token]);
  const [maximized, setMaximized] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!control) return;
    // makes room for the bar (see .desktop-chrome in globals.css)
    document.documentElement.classList.add('desktop-chrome');
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(control));
    } catch {
      /* storage unavailable */
    }
    // keep the token out of the address bar and out of later navigations
    const clean = new URL(window.location.href);
    if (clean.searchParams.has('desktop')) {
      for (const key of ['desktop', 'controlPort', 'controlToken']) clean.searchParams.delete(key);
      window.history.replaceState(null, '', clean.toString());
    }
  }, [control]);

  const send = useCallback(
    async (action: 'minimize' | 'maximize' | 'close') => {
      if (!control) return;
      try {
        const res = await fetch(`http://127.0.0.1:${control.port}/${action}?token=${encodeURIComponent(control.token)}`);
        const data = (await res.json()) as { maximized?: boolean };
        if (typeof data.maximized === 'boolean') setMaximized(data.maximized);
      } catch {
        /* the window is going away */
      }
    },
    [control],
  );

  if (!control) return null;

  const help = (label: string, url: string) => (
    <button
      className="menu-item"
      onClick={() => {
        openExternal(url);
        setHelpOpen(false);
      }}
    >
      {label}
    </button>
  );

  return (
    <header
      className="fixed top-0 left-0 right-0 h-9 z-[400] flex items-center gap-1 pl-2 bg-bg1 border-b border-line select-none"
      style={{ WebkitAppRegion: 'drag', appRegion: 'drag' } as React.CSSProperties}
    >
      <AppIcon size={18} />
      <span className="text-[12px] font-semibold ml-1">OpenRive</span>

      <button
        ref={helpRef}
        className="icon-btn ml-1"
        title="Help and links"
        style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' } as React.CSSProperties}
        onClick={() => setHelpOpen((v) => !v)}
      >
        <CircleHelp size={14} />
      </button>

      {helpOpen && (
        <Popover anchorRef={helpRef} align="start" onClose={() => setHelpOpen(false)} className="w-60">
          <div className="px-2.5 py-1.5 label">Help</div>
          {help('Documentation', LINKS.docs)}
          {help('Keyboard shortcuts', `${LINKS.docs}/Keyboard-Shortcuts`)}
          <div className="menu-sep" />
          <div className="px-2.5 py-1.5 label">OpenRive</div>
          {help('openrive.upstand.dev', LINKS.site)}
          {help('GitHub repository', LINKS.repo)}
          {help('Releases', LINKS.releases)}
          {help('Report an issue', LINKS.issues)}
          {help('MIT License', LINKS.license)}
        </Popover>
      )}

      {/* the empty middle is the drag handle */}
      <div className="flex-1 h-full" />

      <div className="flex items-stretch h-full" style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' } as React.CSSProperties}>
        <button className="w-11 h-full flex items-center justify-center text-t1 hover:bg-bg3" title="Minimise" onClick={() => void send('minimize')}>
          <Minus size={14} />
        </button>
        <button
          className="w-11 h-full flex items-center justify-center text-t1 hover:bg-bg3"
          title={maximized ? 'Restore' : 'Maximise'}
          onClick={() => void send('maximize')}
        >
          {maximized ? <Restore size={12} /> : <Square size={11} />}
        </button>
        <button className="w-11 h-full flex items-center justify-center text-t1 hover:bg-[#c42b1c] hover:text-white" title="Close" onClick={() => void send('close')}>
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
