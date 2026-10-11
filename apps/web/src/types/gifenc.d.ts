declare module 'gifenc' {
  export type PaletteColor = [number, number, number, number?];

  export interface GifEncoder {
    writeFrame(indexedPixels: Uint8Array, width: number, height: number, options?: {
      palette?: PaletteColor[];
      transparent?: boolean;
      transparentIndex?: number;
      delay?: number;
      repeat?: number;
      colorDepth?: number;
      dispose?: number;
    }): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoder;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: {
    format?: 'rgb565' | 'rgba4444';
    clearAlpha?: boolean;
    clearAlphaColor?: number;
    clearAlphaThreshold?: number;
    oneBitAlpha?: boolean;
    useSqrt?: boolean;
  }): PaletteColor[];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: PaletteColor[], format?: 'rgb565' | 'rgba4444'): Uint8Array;
}
