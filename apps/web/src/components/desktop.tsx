'use client';
// Desktop-only pieces of the interface.
//
// The desktop window is frameless, and OpenRive's own top bars act as the
// window handle: they carry the drag region (see .window-drag in globals.css)
// and the window buttons sit at their right end. Everything here renders
// nothing in an ordinary browser tab.
//
// The window loads the app over http rather than from views://, so it cannot
// use Electrobun's bundled RPC bridge. The desktop main process runs a small
// control server on 127.0.0.1 instead, and answers only requests carrying the
// token it generated for this run.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Download, Minus, RefreshCw, Square, Copy as Restore, X } from 'lucide-react';

export const LINKS = {
  site: 'https://openrive.upstand.dev',
  repo: 'https://github.com/UpstandPlatform/OpenRive',
  docs: 'https://github.com/UpstandPlatform/OpenRive/wiki',
  issues: 'https://github.com/UpstandPlatform/OpenRive/issues/new/choose',
  releases: 'https://github.com/UpstandPlatform/OpenRive/releases',
  license: 'https://github.com/UpstandPlatform/OpenRive/blob/main/LICENSE',
};

interface Shell {
  port: string;
  token: string;
}

const STORAGE_KEY = 'openrive:desktop-control';

function readShell(): Shell | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('desktop') === '1') return { port: params.get('controlPort') ?? '', token: params.get('controlToken') ?? '' };
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Shell) : null;
  } catch {
    return null;
  }
}

const subscribe = () => () => {};
/** False while rendering on the server, true once hydrated — no markup mismatch. */
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/** The desktop shell's control server, or null in a browser. */
export function useDesktop(): Shell | null {
  const hydrated = useHydrated();
  const { port = '', token = '' } = (hydrated ? readShell() : null) ?? {};

  useEffect(() => {
    if (!port) return;
    document.documentElement.classList.add('desktop-chrome');
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ port, token }));
    } catch {
      /* storage unavailable */
    }
    // keep the token out of the address bar and out of later navigations
    const clean = new URL(window.location.href);
    if (clean.searchParams.has('desktop')) {
      for (const key of ['desktop', 'controlPort', 'controlToken']) clean.searchParams.delete(key);
      window.history.replaceState(null, '', clean.toString());
    }
  }, [port, token]);

  return port ? { port, token } : null;
}

function shellFromStorage(): Shell | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Shell) : null;
  } catch {
    return null;
  }
}

async function call<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const shell = shellFromStorage();
  if (!shell?.port) return null;
  const query = new URLSearchParams({ token: shell.token, ...params });
  try {
    const res = await fetch(`http://127.0.0.1:${shell.port}${path}?${query}`);
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Opens a link in the system browser when running in the desktop app. */
export function openExternal(url: string) {
  if (shellFromStorage()?.port) {
    void call('/open', { url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Minimise / maximise / close, for the right end of the app's top bar. */
export function WindowControls() {
  const shell = useDesktop();
  const [maximized, setMaximized] = useState(false);

  const send = useCallback(async (action: 'minimize' | 'maximize' | 'close') => {
    const state = await call<{ maximized?: boolean }>(`/${action}`);
    if (typeof state?.maximized === 'boolean') setMaximized(state.maximized);
  }, []);

  if (!shell) return null;

  return (
    <div className="flex items-stretch self-stretch -mr-2 ml-1">
      <button className="w-11 flex items-center justify-center text-t1 hover:bg-bg3" title="Minimise" onClick={() => void send('minimize')}>
        <Minus size={14} />
      </button>
      <button
        className="w-11 flex items-center justify-center text-t1 hover:bg-bg3"
        title={maximized ? 'Restore' : 'Maximise'}
        onClick={() => void send('maximize')}
      >
        {maximized ? <Restore size={12} /> : <Square size={11} />}
      </button>
      <button className="w-11 flex items-center justify-center text-t1 hover:bg-[#c42b1c] hover:text-white" title="Close" onClick={() => void send('close')}>
        <X size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Updates

export interface UpdateState {
  supported: boolean;
  /** the running version */
  version: string;
  channel: string;
  checking: boolean;
  downloading: boolean;
  available: boolean;
  ready: boolean;
  newVersion?: string;
  message?: string;
  error?: string;
}

/** Update state from the desktop shell, polled while a check is running. */
export function useUpdates(enabled: boolean) {
  const [state, setState] = useState<UpdateState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const next = await call<UpdateState>('/update/state');
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    // one read now, then keep reading while a check or download is in flight
    const tick = async () => {
      const next = await call<UpdateState>('/update/state');
      if (stopped) return;
      setState(next);
      if (next?.checking || next?.downloading) timer.current = setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled]);

  const check = useCallback(async () => {
    setState((s) => (s ? { ...s, checking: true, message: 'Checking…' } : s));
    await call('/update/check');
    await refresh();
  }, [refresh]);

  const download = useCallback(async () => {
    setState((s) => (s ? { ...s, downloading: true, message: 'Downloading…' } : s));
    await call('/update/download');
    await refresh();
  }, [refresh]);

  const install = useCallback(async () => {
    await call('/update/apply');
  }, []);

  return { state, check, download, install };
}

/**
 * The update section of a menu: the running version, a check button, and the
 * download / restart step once an update is found.
 */
export function UpdateMenuSection({ onDone }: { onDone?: () => void }) {
  const shell = useDesktop();
  const { state, check, download, install } = useUpdates(!!shell);

  if (!shell || !state) return null;

  return (
    <>
      <div className="menu-sep" />
      <div className="px-2.5 py-1.5 label">
        OpenRive {state.version}
        {state.channel && state.channel !== 'stable' ? ` · ${state.channel}` : ''}
      </div>
      {!state.supported ? (
        <div className="px-2.5 pb-1.5 text-t3 text-[11px]">Updates are managed outside the app in this build.</div>
      ) : state.ready ? (
        <button className="menu-item text-accent" onClick={() => void install()}>
          <RefreshCw size={13} /> Restart to install {state.newVersion ?? 'the update'}
        </button>
      ) : state.available ? (
        <button className="menu-item text-accent" disabled={state.downloading} onClick={() => void download()}>
          <Download size={13} /> {state.downloading ? 'Downloading…' : `Download ${state.newVersion ?? 'update'}`}
        </button>
      ) : (
        <button
          className="menu-item"
          disabled={state.checking}
          onClick={async () => {
            await check();
            onDone?.();
          }}
        >
          <RefreshCw size={13} /> {state.checking ? 'Checking…' : 'Check for updates'}
        </button>
      )}
      {(state.message || state.error) && (
        <div className={`px-2.5 pb-1.5 text-[11px] ${state.error ? 'text-[#ffb4b4]' : 'text-t3'}`}>{state.error ?? state.message}</div>
      )}
    </>
  );
}

/** Help links, shared by the user menu and the editor's menu. */
export function HelpMenuItems({ onDone }: { onDone?: () => void }) {
  const item = (label: string, url: string) => (
    <button
      className="menu-item"
      onClick={() => {
        openExternal(url);
        onDone?.();
      }}
    >
      {label}
    </button>
  );
  return (
    <>
      <div className="menu-sep" />
      <div className="px-2.5 py-1.5 label">Help</div>
      {item('Documentation', LINKS.docs)}
      {item('openrive.upstand.dev', LINKS.site)}
      {item('GitHub repository', LINKS.repo)}
      {item('Report an issue', LINKS.issues)}
    </>
  );
}
