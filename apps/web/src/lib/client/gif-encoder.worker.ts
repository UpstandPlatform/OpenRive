import { GIFEncoder, applyPalette, quantize } from 'gifenc';

self.onmessage = (event: MessageEvent<{ buffers: ArrayBuffer[]; width: number; height: number; fps: number }>) => {
  try {
    const { buffers, width, height, fps } = event.data;
    const frames = buffers.map((buffer) => new Uint8Array(buffer));
    const rgba = new Uint8Array(width * height * 4 * frames.length);
    frames.forEach((frame, index) => rgba.set(frame, index * width * height * 4));
    const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
    const transparentIndex = palette.findIndex((color) => (color[3] ?? 255) < 128);
    const gif = GIFEncoder();
    for (const frame of frames) {
      gif.writeFrame(applyPalette(frame, palette, 'rgba4444'), width, height, {
        palette,
        transparent: transparentIndex >= 0,
        transparentIndex: Math.max(0, transparentIndex),
        delay: Math.round(1000 / fps),
        repeat: 0,
        dispose: 2,
      });
    }
    gif.finish();
    const bytes = gif.bytes().slice().buffer;
    self.postMessage({ bytes }, { transfer: [bytes] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'GIF encoding failed.' });
  }
};
