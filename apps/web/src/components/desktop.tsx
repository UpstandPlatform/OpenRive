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
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Check, Download, LoaderCircle, Minus, RefreshCw, Sparkles, Square, Copy as Restore, X } from 'lucide-react';
import { APP_VERSION } from '@/lib/appVersion';

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
const DISMISSED_UPDATE_KEY = 'openrive:desktop-dismissed-update';
const UPDATE_ACTIVITY_EVENT = 'openrive:desktop-update-activity';
let cachedShell: Shell | null = null;

function announceUpdateActivity(activity: Partial<UpdateState>) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPDATE_ACTIVITY_EVENT, { detail: activity }));
  }
}

function parseShell(value: string): Shell | null {
  try {
    const shell = JSON.parse(value) as Partial<Shell>;
    return typeof shell.port === 'string' && shell.port.length > 0 && typeof shell.token === 'string'
      ? { port: shell.port, token: shell.token }
      : null;
  } catch {
    return null;
  }
}

function readShell(): Shell | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (cachedShell) return cachedShell;
  if (params.get('desktop') === '1') {
    const port = params.get('controlPort') ?? '';
    const token = params.get('controlToken') ?? '';
    if (port) {
      cachedShell = { port, token };
      return cachedShell;
    }
  }
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) cachedShell = parseShell(stored);
    return cachedShell;
  } catch {
    return cachedShell;
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
  const shell = hydrated ? readShell() : null;
  const { port = '', token = '' } = shell ?? {};

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

  return shell;
}

function shellFromStorage(): Shell | null {
  if (cachedShell) return cachedShell;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) cachedShell = parseShell(stored);
    return cachedShell;
  } catch {
    return cachedShell;
  }
}

async function call<T>(path: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET'): Promise<T | null> {
  const shell = shellFromStorage();
  if (!shell?.port) return null;
  const query = new URLSearchParams({ token: shell.token, ...params });
  try {
    const res = await fetch(`http://127.0.0.1:${shell.port}${path}?${query}`, { method, cache: 'no-store' });
    if (!res.ok) return null;
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

  useEffect(() => {
    if (!shell) return;
    let active = true;
    const refresh = async () => {
      const state = await call<{ maximized?: boolean }>('/state');
      if (active && typeof state?.maximized === 'boolean') setMaximized(state.maximized);
    };
    void refresh();
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      clearInterval(timer);
    };
  }, [shell]);

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
  hasChecked: boolean;
  checking: boolean;
  downloading: boolean;
  installing: boolean;
  available: boolean;
  skipped: boolean;
  ready: boolean;
  progress?: number;
  newVersion?: string;
  message?: string;
  error?: string;
}

/** Update state from the desktop shell; remote checks are initiated by the main process. */
export function useUpdates(enabled: boolean) {
  const [state, setState] = useState<UpdateState | null>(null);

  const refresh = useCallback(async () => {
    const next = await call<UpdateState>('/update/state');
    if (next) setState(next);
    return next;
  }, []);

  const shouldPoll = enabled && (!state || (state.supported && (!state.hasChecked || state.checking || state.downloading || state.installing)));

  useEffect(() => {
    if (!shouldPoll) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    // This polls only the local control server until its one startup check is
    // complete, or while a user-requested download/install is active.
    const tick = async () => {
      const next = await call<UpdateState>('/update/state');
      if (stopped) return;
      if (next) setState(next);
      attempts += 1;
      if (attempts < 120 && (!next || (next.supported && (!next.hasChecked || next.checking || next.downloading || next.installing)))) {
        timer = setTimeout(tick, 1000);
      }
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [shouldPoll]);

  useEffect(() => {
    const onActivity = (event: Event) => {
      const activity = (event as CustomEvent<Partial<UpdateState>>).detail;
      setState((current) => current ? { ...current, ...activity } : current);
      // Give the main process time to accept the command, then refresh the
      // shared UI state so every mounted update surface follows the same job.
      window.setTimeout(() => void refresh(), 250);
    };
    window.addEventListener(UPDATE_ACTIVITY_EVENT, onActivity);
    return () => window.removeEventListener(UPDATE_ACTIVITY_EVENT, onActivity);
  }, [refresh]);

  const check = useCallback(async () => {
    const activity = { checking: true, message: 'Checking…' };
    setState((s) => (s ? { ...s, ...activity } : s));
    announceUpdateActivity(activity);
    const next = await call<UpdateState>('/update/check', {}, 'POST');
    if (next) setState(next);
    else await refresh();
    return next;
  }, [refresh]);

  const download = useCallback(async () => {
    const activity = { downloading: true, progress: undefined, message: 'Downloading…' };
    setState((s) => (s ? { ...s, ...activity } : s));
    announceUpdateActivity(activity);
    const next = await call<UpdateState>('/update/download', {}, 'POST');
    if (next) setState(next);
    else await refresh();
    return next;
  }, [refresh]);

  const install = useCallback(async () => {
    const activity = { installing: true, message: 'Restarting OpenRive to install the update…' };
    setState((s) => (s ? { ...s, ...activity } : s));
    announceUpdateActivity(activity);
    const next = await call<UpdateState>('/update/apply', {}, 'POST');
    if (next) setState(next);
    else await refresh();
    return next;
  }, [refresh]);

  const skip = useCallback(async (version: string) => {
    const next = await call<UpdateState>('/update/skip', { version }, 'POST');
    if (next) setState(next);
    else await refresh();
    return next;
  }, [refresh]);

  return { state, check, download, install, skip, refresh };
}

/** A quiet, persistent update notice for the desktop app. */
export function UpdateNotice() {
  const shell = useDesktop();
  const { state, download, install, skip } = useUpdates(!!shell);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return sessionStorage.getItem(DISMISSED_UPDATE_KEY);
    } catch {
      return null;
    }
  });
  const [working, setWorking] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  const key = state?.newVersion ? `${state.channel}:${state.newVersion}` : null;
  const visible = !!shell && !!state?.supported && state.hasChecked && state.available && !state.skipped && key !== dismissedVersion;

  const dismissForNow = (versionKey: string) => {
    setDismissedVersion(versionKey);
    try {
      sessionStorage.setItem(DISMISSED_UPDATE_KEY, versionKey);
    } catch {
      /* the notice remains dismissed for this page session */
    }
  };

  const updateNow = async () => {
    if (!state || working || state.downloading || state.installing) return;
    setWorking(true);
    setLocalError(null);
    let result = state;
    if (!result.ready) result = (await download()) ?? result;
    if (!result.ready) {
      setLocalError(result.error ?? 'The update could not be prepared. You can retry from here.');
      setWorking(false);
      return;
    }
    const started = await install();
    if (!started) {
      setLocalError('Could not contact the desktop updater. Please try again.');
      setWorking(false);
    } else if (started.error) {
      setLocalError(started.error);
      setWorking(false);
    } else {
      setWorking(false);
    }
  };

  const skipThisVersion = async () => {
    if (!state?.newVersion || skipping) return;
    setSkipping(true);
    const saved = await skip(state.newVersion);
    if (!saved?.skipped) setLocalError('Could not save this choice. Please try again.');
    setSkipping(false);
  };

  if (!visible || !state || !key) return null;

  const busy = state.downloading || state.installing || working;
  const error = localError ?? state.error;
  const progress = state.progress;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-end p-4 sm:p-6">
      <section role="region" aria-label="OpenRive update notification" className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-line2 bg-bg1 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#3d8bd0]/15 text-[#73b9f0]">
              {busy ? <LoaderCircle size={19} className="animate-spin" /> : <Sparkles size={19} />}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div role="status" aria-live="polite" className="text-[13px] font-semibold text-t0">OpenRive {state.newVersion} is available</div>
              <p className="mt-1 text-[11px] leading-relaxed text-t2">
                {state.installing
                  ? 'Restarting OpenRive to finish the update…'
                  : state.downloading || working
                    ? state.message || 'Preparing the update…'
                    : 'Update now from inside OpenRive, or skip this version.'}
              </p>
            </div>
            <button
              type="button"
              className="-mr-1 -mt-1 rounded-md p-1 text-t3 hover:bg-bg3 hover:text-t0"
              title="Dismiss for now"
              aria-label="Dismiss update notice for now"
              onClick={() => dismissForNow(key)}
            >
              <X size={15} />
            </button>
          </div>

          {(state.downloading || (working && !state.ready)) && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-t3">
                <span>{progress === undefined ? 'Preparing download' : 'Downloading update'}</span>
                {progress !== undefined && <span>{progress}%</span>}
              </div>
              <div
                className="h-1 overflow-hidden rounded-full bg-bg3"
                role="progressbar"
                aria-label="Update download progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                {progress === undefined ? (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-editor-accent" />
                ) : (
                  <div className="h-full rounded-full bg-editor-accent transition-[width]" style={{ width: `${progress}%` }} />
                )}
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-3 rounded-md bg-[#3a1f1f] px-2.5 py-2 text-[11px] text-[#ffb4b4]">{error}</p>}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className="btn h-8 px-2.5 text-[11px]" disabled={busy || skipping} onClick={() => void skipThisVersion()}>
              {skipping ? 'Saving…' : 'Skip this version'}
            </button>
            <button type="button" className="btn btn-primary h-8 px-3 text-[11px]" disabled={busy} onClick={() => void updateNow()}>
              {state.installing ? <><LoaderCircle size={13} className="animate-spin" /> Restarting…</>
                : state.downloading || working ? <><LoaderCircle size={13} className="animate-spin" /> Updating…</>
                  : state.ready ? <><Check size={13} /> Restart to update</>
                    : <><Download size={13} /> {error ? 'Retry update' : 'Update now'}</>}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The update section of a menu: the running version, a check button, and the
 * download / restart step once an update is found.
 */
export function UpdateMenuSection({ onDone }: { onDone?: () => void }) {
  const shell = useDesktop();
  const { state, check, download, install } = useUpdates(!!shell);

  if (!shell || !state) {
    return (
      <>
        <div className="menu-sep" />
        <div className="px-2.5 py-1.5 label">OpenRive {APP_VERSION}</div>
      </>
    );
  }

  const displayVersion = state.version && state.version !== '0.0.0' ? state.version : APP_VERSION;

  return (
    <>
      <div className="menu-sep" />
      <div className="px-2.5 py-1.5 label">
        OpenRive {displayVersion}
        {state.channel && state.channel !== 'stable' ? ` · ${state.channel}` : ''}
      </div>
      {!state.supported ? (
        <div className="px-2.5 pb-1.5 text-t3 text-[11px]">Updates are managed outside the app in this build.</div>
      ) : state.ready ? (
        <button className="menu-item text-editor-accent" onClick={() => { void install(); onDone?.(); }}>
          <RefreshCw size={13} /> Restart to install {state.newVersion ?? 'the update'}
        </button>
      ) : state.available ? (
        <button className="menu-item text-editor-accent" disabled={state.downloading} onClick={() => { void download(); onDone?.(); }}>
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
  const shell = useDesktop();
  const [copied, setCopied] = useState(false);
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
      {shell && (
        <button
          className="menu-item"
          onClick={async () => {
            await navigator.clipboard?.writeText(`${window.location.origin}/api/mcp`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'MCP endpoint copied' : 'Copy MCP endpoint'}
        </button>
      )}
      {item('Documentation', LINKS.docs)}
      {item('openrive.upstand.dev', LINKS.site)}
      {item('GitHub repository', LINKS.repo)}
      {item('Report an issue', LINKS.issues)}
    </>
  );
}
