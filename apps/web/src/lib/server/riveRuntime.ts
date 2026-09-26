// Finds the Rive runtime files the editor is currently rendering with, so the
// bundle export can ship the very same build. Which one is active is written to
// public/rive/runtime.json by scripts/copy-wasm.ts and scripts/rive-sdk.ts.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_RUNTIME_VERSION, type BundleFile } from '@openrive/rive/bundle';

export interface RuntimeInfo {
  /** 'npm' = the published @rive-app/canvas-advanced, 'submodule' = built from vendor/rive-wasm */
  source: 'npm' | 'submodule';
  version: string;
  /** URL path the files are served under */
  base: string;
}

const RUNTIME_FILES = ['canvas_advanced.mjs', 'rive.wasm'];

/**
 * Reads a file from public/rive, whether the server runs from apps/web or from
 * the repo root. Both roots are spelled out so the bundler can see them and does
 * not trace the whole project.
 */
async function readRuntimeFile(file: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), 'public', 'rive', file)));
  } catch {
    /* not running from apps/web */
  }
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), 'apps', 'web', 'public', 'rive', file)));
  } catch {
    return null;
  }
}

/** Which runtime build the editor loads. */
export async function runtimeInfo(): Promise<RuntimeInfo> {
  const raw = await readRuntimeFile('runtime.json');
  if (raw) {
    try {
      const info = JSON.parse(new TextDecoder().decode(raw)) as Partial<RuntimeInfo>;
      const source = info.source === 'submodule' ? 'submodule' : 'npm';
      return { source, version: info.version || DEFAULT_RUNTIME_VERSION, base: source === 'submodule' ? '/rive/local/' : '/rive/' };
    } catch {
      /* fall through to the default */
    }
  }
  return { source: 'npm', version: DEFAULT_RUNTIME_VERSION, base: '/rive/' };
}

/**
 * The runtime files to put in an offline bundle. Read from public/rive (or
 * public/rive/local for a submodule build); falls back to fetching them from
 * this server when the files are not on disk next to the process.
 */
export async function runtimeFiles(info: RuntimeInfo, origin?: string): Promise<BundleFile[]> {
  const prefix = info.source === 'submodule' ? 'local/' : '';
  const out: BundleFile[] = [];
  for (const name of RUNTIME_FILES) {
    let data = await readRuntimeFile(`${prefix}${name}`);
    if (!data && origin) {
      const res = await fetch(new URL(`${info.base}${name}`, origin)).catch(() => null);
      if (res?.ok) data = new Uint8Array(await res.arrayBuffer());
    }
    if (!data) throw new Error(`Could not read the Rive runtime file ${name}. Run "bun install" (or "bun run rive:sync") and try again.`);
    out.push({ name, data });
  }
  return out;
}
