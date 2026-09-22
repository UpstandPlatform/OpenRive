'use client';
import { BUNDLED_FONTS } from '../rive/text';

const cache = new Map<string, Promise<Uint8Array>>();

/** Loads a bundled font (served locally from /public/fonts). */
export function loadBundledFont(name = 'Inter'): Promise<{ name: string; bytes: Uint8Array }> {
  const font = BUNDLED_FONTS.find((f) => f.name === name) ?? BUNDLED_FONTS[0];
  if (!cache.has(font.url)) {
    cache.set(
      font.url,
      fetch(font.url).then(async (r) => {
        if (!r.ok) throw new Error(`Could not load font ${font.name}`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
  }
  return cache.get(font.url)!.then((bytes) => ({ name: font.name, bytes }));
}
