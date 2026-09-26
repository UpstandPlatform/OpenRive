'use client';
// Loads the Rive WASM runtime (served locally from /public/rive).
// Normally this is the published @rive-app/canvas-advanced. When a runtime built
// from the vendor/rive-wasm submodule has been synced in (bun run rive:sync), it
// is served from /rive/local and loaded from there instead — see docs/rive-sdk.md.
import type { RiveCanvas } from '@rive-app/canvas-advanced';

let runtimePromise: Promise<RiveCanvas> | null = null;

type RuntimeModule = { default: (opts: { locateFile: (file: string) => string }) => Promise<RiveCanvas> };

async function localRuntimeBase(): Promise<string | null> {
  try {
    const res = await fetch('/rive/runtime.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const info = (await res.json()) as { source?: string };
    return info.source === 'submodule' ? '/rive/local/' : null;
  } catch {
    return null;
  }
}

async function load(): Promise<RiveCanvas> {
  const base = await localRuntimeBase();
  if (base) {
    const mod: RuntimeModule = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${base}canvas_advanced.mjs`);
    return mod.default({ locateFile: (file: string) => `${base}${file}` });
  }
  const mod = await import('@rive-app/canvas-advanced');
  return mod.default({
    // the package ships its wasm as rive.wasm (copied to /public/rive on install)
    locateFile: (file: string) => (file.endsWith('.wasm') ? '/rive/rive.wasm' : `/rive/${file}`),
  });
}

export function loadRuntime(): Promise<RiveCanvas> {
  if (!runtimePromise) {
    runtimePromise = load();
    runtimePromise.catch(() => {
      runtimePromise = null; // allow a retry
    });
  }
  return runtimePromise;
}

export type { RiveCanvas };
