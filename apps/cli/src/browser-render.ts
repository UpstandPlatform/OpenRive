// Optional local Chromium renderer for GPU-backed Rive content, including image meshes.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function renderInBrowser(
  bytes: Uint8Array,
  options: { width: number; height: number; artboardIndex: number; animationIndex: number; time: number; scale: number; executablePath?: string },
) {
  const runtime = fileURLToPath(import.meta.resolve('@rive-app/canvas-advanced'));
  const resources = new Map([
    ['/runtime.mjs', { body: readFileSync(runtime), type: 'text/javascript' }],
    ['/rive.wasm', { body: readFileSync(path.join(path.dirname(runtime), 'rive.wasm')), type: 'application/wasm' }],
    ['/input.riv', { body: Buffer.from(bytes), type: 'application/octet-stream' }],
  ]);
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/')
        return new Response('<!doctype html><html><body style="margin:0"><canvas></canvas></body></html>', { headers: { 'content-type': 'text/html' } });
      const resource = resources.get(pathname);
      return resource ? new Response(resource.body, { headers: { 'content-type': resource.type } }) : new Response('Not found', { status: 404 });
    },
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    try {
      browser = await chromium.launch({ headless: true, executablePath: options.executablePath, args: ['--enable-unsafe-swiftshader'] });
    } catch (error) {
      throw new Error(
        `Local browser rendering requires Chromium. Run "bunx playwright-core@1.64.0 install chromium" or pass --browser <executable>. ${(error as Error).message}`,
      );
    }
    const page = await browser.newPage({ viewport: { width: Math.min(options.width, 1920), height: Math.min(options.height, 1080) } });
    // Rendering is local and uses embedded assets; no remote requests are allowed.
    const origin = server.url.origin;
    await page.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
    await page.goto(origin);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const render = page.evaluate(async (config) => {
      const modulePath = '/runtime.mjs';
      const { default: init } = await import(modulePath);
      const rive = await init({ locateFile: () => '/rive.wasm' });
      const file = await rive.load(new Uint8Array(await (await fetch('/input.riv')).arrayBuffer()), undefined, false);
      const artboard = file.artboardByIndex(config.artboardIndex);
      const canvas = document.querySelector('canvas')!;
      canvas.width = config.width;
      canvas.height = config.height;
      const renderer = rive.makeRenderer(canvas);
      const animation = config.animationIndex >= 0 ? new rive.LinearAnimationInstance(artboard.animationByIndex(config.animationIndex), artboard) : null;
      try {
        if (animation) {
          animation.time = config.time;
          animation.apply(1);
        }
        artboard.advance(0);
        renderer.clear();
        renderer.save();
        renderer.transform(config.scale, 0, 0, config.scale, 0, 0);
        artboard.draw(renderer);
        renderer.restore();
        rive.resolveAnimationFrame();
        return canvas.toDataURL('image/png').split(',')[1];
      } finally {
        animation?.delete();
        artboard.delete();
        renderer.delete?.();
        file.unref?.();
      }
    }, options);
    let png: string;
    try {
      png = await Promise.race([
        render,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Rive rendering timed out after 30 seconds. Check embedded assets and runtime compatibility.')), 30_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    return Buffer.from(png, 'base64');
  } finally {
    await browser?.close();
    server.stop(true);
  }
}
