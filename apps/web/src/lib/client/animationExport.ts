'use client';
import { exportRiv, type RiveDoc } from '@openrive/rive/document';
import type { ViewModelInstance } from '@rive-app/canvas-advanced';
import { loadRuntime } from '@/lib/runtime';

export interface RenderedFrame { data: ImageData; }
export interface AnimationExportOptions {
  artboardIndex: number;
  animationIndex: number;
  fps: number;
  scale: number;
  maxPixels?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function renderAnimationFrames(doc: RiveDoc, options: AnimationExportOptions): Promise<{ frames: RenderedFrame[]; width: number; height: number }> {
  const abDoc = doc.artboards[options.artboardIndex];
  const animDoc = abDoc?.animations[options.animationIndex];
  if (!abDoc || !animDoc) throw new Error('Choose an artboard and timeline before exporting.');
  if (!Number.isFinite(options.fps) || options.fps <= 0 || options.fps > 60) throw new Error('Frame rate must be between 1 and 60 fps.');
  if (!Number.isFinite(options.scale) || options.scale <= 0 || options.scale > 2) throw new Error('Resolution scale must be greater than 0 and no greater than 2.');
  const sourceFpsValue = Number(animDoc.props.fps);
  const sourceFps = Number.isFinite(sourceFpsValue) && sourceFpsValue > 0 ? sourceFpsValue : 60;
  const durationValue = Number(animDoc.props.duration) / sourceFps;
  const durationSeconds = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 1 / sourceFps;
  const total = Math.max(1, Math.min(300, Math.ceil(durationSeconds * options.fps)));
  const artboardWidth = Number(abDoc.artboard.props.width);
  const artboardHeight = Number(abDoc.artboard.props.height);
  if (!Number.isFinite(artboardWidth) || !Number.isFinite(artboardHeight) || artboardWidth <= 0 || artboardHeight <= 0) throw new Error('The selected artboard has invalid dimensions.');
  const width = Math.max(1, Math.round(artboardWidth * options.scale));
  const height = Math.max(1, Math.round(artboardHeight * options.scale));
  const pixelBudget = options.maxPixels ?? 24_000_000;
  if (!Number.isSafeInteger(pixelBudget) || pixelBudget <= 0) throw new Error('The export pixel limit is invalid.');
  if (width > 32_767 || height > 32_767 || width * height * total > pixelBudget) throw new Error(`This export would exceed its ${pixelBudget.toLocaleString()}-pixel safety limit. Choose a lower scale or frame rate.`);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not create a 2D canvas for export.');
  const rive = await loadRuntime();
  const file = await rive.load(exportRiv(doc), undefined, false);
  const renderer = rive.makeRenderer(canvas);
  let artboard: ReturnType<typeof file.artboardByIndex> | null = null;
  let instance: InstanceType<typeof rive.LinearAnimationInstance> | null = null;
  let vmi: ViewModelInstance | null = null;
  const frames: RenderedFrame[] = [];
  try {
    artboard = file.artboardByIndex(options.artboardIndex);
    const vm = file.viewModelCount() > 0 ? file.defaultArtboardViewModel(artboard) : null;
    vmi = (vm && (vm.defaultInstance() ?? vm.instance())) ?? null;
    if (vmi) artboard.bindViewModelInstance(vmi);
    const animObj = artboard.animationByIndex(options.animationIndex);
    instance = new rive.LinearAnimationInstance(animObj, artboard);
    const ratio = Math.min(width / Number(abDoc.artboard.props.width), height / Number(abDoc.artboard.props.height));
    for (let i = 0; i < total; i++) {
      renderer.clear();
      instance.time = Math.min(i / options.fps, durationSeconds);
      instance.apply(1);
      artboard.advance(0);
      renderer.save();
      // RendererWrapper forwards Canvas2D's six-value transform at runtime;
      // the package declaration still models its internal Mat2D overload.
      (renderer as unknown as { transform: (...matrix: number[]) => void }).transform(ratio, 0, 0, ratio, 0, 0);
      artboard.draw(renderer);
      renderer.restore();
      frames.push({ data: context.getImageData(0, 0, width, height) });
      options.onProgress?.(i + 1, total);
      // Give the browser a paint opportunity during large exports.
      if (i % 4 === 3) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  } finally {
    vmi?.unref?.();
    instance?.delete();
    artboard?.delete();
    (renderer as { delete?: () => void }).delete?.();
    file.unref?.();
    canvas.width = 1;
    canvas.height = 1;
  }
  return { frames, width, height };
}

export async function encodeGif(frames: RenderedFrame[], width: number, height: number, fps: number): Promise<Uint8Array> {
  if (!frames.length) throw new Error('No animation frames were rendered.');
  if (width * height * frames.length > 24_000_000) throw new Error('GIF export is limited to 24-million source pixels. Lower the scale or frame rate.');
  const worker = new Worker(new URL('./gif-encoder.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.bytes) resolve(new Uint8Array(event.data.bytes));
      else reject(new Error('GIF encoding returned no data.'));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'GIF encoding failed.'));
    };
    const buffers = frames.map((frame) => frame.data.data.buffer as ArrayBuffer);
    worker.postMessage({ buffers, width, height, fps }, buffers);
  });
}

export async function encodeSpriteSheet(frames: RenderedFrame[], width: number, height: number): Promise<Blob> {
  if (!frames.length || width <= 0 || height <= 0) throw new Error('No animation frames were rendered.');
  const columns = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const sheetWidth = columns * width;
  const sheetHeight = rows * height;
  if (sheetWidth > 32_767 || sheetHeight > 32_767 || sheetWidth * sheetHeight > 16_000_000) throw new Error('Sprite sheet exceeds the 16-million-pixel safety limit. Lower the scale or frame rate.');
  const canvas = document.createElement('canvas');
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create a 2D canvas for export.');
  frames.forEach((frame, i) => context.putImageData(frame.data, (i % columns) * width, Math.floor(i / columns) * height));
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not encode the sprite sheet as PNG.')), 'image/png'));
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}
