import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData, Path2D } from '@napi-rs/canvas';
import initRive from '@rive-app/canvas-advanced';
import { assetBytes, fileAssets } from '@openrive/rive/assets';
import { exportRiv, type RiveDoc } from '@openrive/rive/document';
import { StoreError } from './project-store';

export interface RenderFrameOptions {
  artboard?: string;
  animation?: string;
  time?: number;
  scale?: number;
  maxPixels?: number;
}

/** Render one vector-only still frame with the official Rive WASM runtime. */
export async function renderRiveFrame(doc: RiveDoc, options: RenderFrameOptions = {}) {
  const artboardRef = options.artboard ?? '0';
  const artboardIndex = /^\d+$/.test(artboardRef)
    ? Number(artboardRef)
    : doc.artboards.findIndex((item) => item.artboard.props.name === artboardRef);
  const artboardDoc = doc.artboards[artboardIndex];
  if (!artboardDoc) throw new StoreError(`Artboard "${artboardRef}" not found`);

  const animationRef = options.animation ?? '';
  const animationIndex = animationRef === ''
    ? -1
    : /^\d+$/.test(animationRef)
      ? Number(animationRef)
      : artboardDoc.animations.findIndex((item) => item.props.name === animationRef);
  if (animationRef && !artboardDoc.animations[animationIndex]) {
    throw new StoreError(`Timeline "${animationRef}" not found on artboard "${String(artboardDoc.artboard.props.name)}"`);
  }
  const time = options.time ?? 0;
  const scale = options.scale ?? 1;
  if (!Number.isFinite(time) || time < 0) throw new StoreError('Time must be a finite, non-negative number of seconds');
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4) throw new StoreError('Scale must be greater than zero and no greater than 4');
  const width = Math.max(1, Math.round(Number(artboardDoc.artboard.props.width) * scale));
  const height = Math.max(1, Math.round(Number(artboardDoc.artboard.props.height) * scale));
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new StoreError('The selected artboard has invalid dimensions');
  if (width * height > (options.maxPixels ?? 64_000_000)) throw new StoreError('Output exceeds the pixel safety limit');

  const needsBrowser = doc.top.some((asset) => asset.type === 'ImageAsset') ||
    doc.artboards.some((ab) => ab.objects.some((object) => object.type === 'Mesh' || object.type === 'Feather'));
  if (needsBrowser) throw new StoreError('This file contains images, meshes, or feathering that require the CLI browser renderer.');
  for (const asset of fileAssets(doc)) {
    if (!assetBytes(asset) && doc.artboards.some((ab) => ab.objects.some((object) => object.props.assetId === asset.id))) {
      throw new StoreError(`Embed asset "${String(asset.props.name || asset.type)}" before rendering locally.`);
    }
  }

  if (typeof globalThis.ImageData === 'undefined') Object.defineProperty(globalThis, 'ImageData', { value: ImageData });
  if (typeof globalThis.Path2D === 'undefined') Object.defineProperty(globalThis, 'Path2D', { value: Path2D });
  const runtimeDir = path.dirname(fileURLToPath(import.meta.resolve('@rive-app/canvas-advanced')));
  const wasmBinary = Uint8Array.from(readFileSync(path.join(runtimeDir, 'rive.wasm'))).buffer as ArrayBuffer;
  const rive = await initRive({
    wasmBinary,
    locateFile: (file) => path.join(runtimeDir, file === 'canvas_advanced.wasm' ? 'rive.wasm' : file),
  });
  const canvas = createCanvas(width, height);
  let file: Awaited<ReturnType<typeof rive.load>> | null = null;
  let artboard: ReturnType<Awaited<ReturnType<typeof rive.load>>['artboardByIndex']> | null = null;
  let renderer: ReturnType<typeof rive.makeRenderer> | null = null;
  let animation: InstanceType<typeof rive.LinearAnimationInstance> | null = null;
  try {
    file = await rive.load(exportRiv(doc), undefined, false);
    artboard = file.artboardByIndex(artboardIndex);
    renderer = rive.makeRenderer(canvas as unknown as HTMLCanvasElement);
    animation = animationIndex >= 0 ? new rive.LinearAnimationInstance(artboard.animationByIndex(animationIndex), artboard) : null;
    renderer.clear();
    if (animation) {
      animation.time = time;
      animation.apply(1);
    }
    artboard.advance(0);
    renderer.save();
    (renderer as unknown as { transform: (...values: number[]) => void }).transform(scale, 0, 0, scale, 0, 0);
    artboard.draw(renderer);
    renderer.restore();
    rive.resolveAnimationFrame();
    return { png: canvas.toBuffer('image/png'), width, height, artboardIndex, animationIndex, time };
  } finally {
    animation?.delete();
    artboard?.delete();
    (renderer as { delete?: () => void } | null)?.delete?.();
    file?.unref?.();
  }
}
