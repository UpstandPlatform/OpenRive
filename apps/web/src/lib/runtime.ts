'use client';
// Loads the official Rive WASM runtime (served locally from /public/rive).
import type { RiveCanvas } from '@rive-app/canvas-advanced';

let runtimePromise: Promise<RiveCanvas> | null = null;

export function loadRuntime(): Promise<RiveCanvas> {
  if (!runtimePromise) {
    runtimePromise = import('@rive-app/canvas-advanced').then((mod) =>
      mod.default({
        // the package ships its wasm as rive.wasm (copied to /public/rive on install)
        locateFile: (file: string) => (file.endsWith('.wasm') ? '/rive/rive.wasm' : `/rive/${file}`),
      }),
    );
    runtimePromise.catch(() => {
      runtimePromise = null; // allow a retry
    });
  }
  return runtimePromise;
}

export type { RiveCanvas };
