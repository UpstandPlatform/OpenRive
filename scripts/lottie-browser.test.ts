// Import real Lottie and Telegram TGS fixtures through the dashboard and open each in Preview.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import type { useEditor } from '../apps/web/src/lib/store/editor';

declare global {
  interface Window {
    __riveEditor: typeof useEditor;
  }
}

const [jsonFixture, tgsFixture] = process.argv.slice(2);
if (!jsonFixture || !tgsFixture || !existsSync(jsonFixture) || !existsSync(tgsFixture)) {
  throw new Error('Pass an existing real Lottie JSON fixture and Telegram TGS fixture.');
}

const scratch = mkdtempSync(path.join(tmpdir(), 'openrive-lottie-browser-'));
const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
const port = portProbe.port!;
portProbe.stop(true);
const origin = `http://127.0.0.1:${port}`;
const server = Bun.spawn(
  [process.execPath, 'run', 'dev', '--port', String(port), '--hostname', '127.0.0.1'],
  {
    cwd: path.resolve(import.meta.dir, '../apps/web'),
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      DATABASE_URL: '',
      OPENRIVE_DATABASE_URL: '',
      OPENRIVE_EDITION: 'local',
      OPENRIVE_AUTH: 'off',
      OPENRIVE_ACCESS_TOKEN: '',
      OPENRIVE_URL: origin,
      OPENRIVE_DATA_DIR: scratch,
    },
    stdout: 'ignore',
    stderr: 'inherit',
  },
);

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const pageErrors: string[] = [];
try {
  const deadline = Date.now() + 60_000;
  while (true) {
    try {
      if ((await fetch(`${origin}/api/projects`)).ok) break;
    } catch {
      /* wait for startup */
    }
    if (Date.now() > deadline || server.exitCode !== null) throw new Error('Scratch editor did not start.');
    await Bun.sleep(250);
  }

  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watchPageErrors(page);
  for (const fixture of [jsonFixture, tgsFixture]) {
    const projectId = await importThroughDashboard(page, fixture);
    const previewPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = await previewPromise;
    watchPageErrors(preview);
    await preview.waitForURL(`**/preview/${projectId}`);
    await preview.getByRole('banner').waitFor();
    await preview.locator('canvas').first().waitFor({ state: 'visible' });
    await preview.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return !!canvas && canvas.width > 0 && canvas.height > 0;
    });
    assert.equal(await preview.getByText('Preview', { exact: true }).count(), 1, `${path.basename(fixture)} must open in Preview.`);
    console.log(`✓ browser: ${path.basename(fixture)} imported and opened in Preview`);
    await preview.close();
    await page.goto(origin);
  }

  assert.deepEqual(pageErrors, [], 'Lottie imports and preview pages must have no browser runtime errors.');
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    if (process.platform === 'win32') {
      const shutdown = Bun.spawn(['taskkill', '/PID', String(server.pid), '/T', '/F'], { stdout: 'ignore', stderr: 'ignore' });
      await shutdown.exited;
    } else {
      try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
    }
  }
  await server.exited;
  rmSync(scratch, { recursive: true, force: true });
}

function watchPageErrors(page: Page): void {
  page.on('pageerror', (error) => pageErrors.push(error.message));
}

async function importThroughDashboard(page: Page, fixture: string): Promise<string> {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Import file', exact: true }).waitFor();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import file', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(path.resolve(fixture));
  await page.waitForURL(/\/editor\/[^/]+$/);
  await page.waitForFunction(() => !!window.__riveEditor?.getState().doc);
  const contents = await page.evaluate(() => {
    const artboard = window.__riveEditor.getState().doc?.artboards[0];
    return {
      shapeCount: artboard?.objects.filter((object) => object.type === 'Shape').length ?? 0,
      textCount: artboard?.objects.filter((object) => object.type === 'Text').length ?? 0,
      animationCount: artboard?.animations.length ?? 0,
    };
  });
  assert.ok(contents.shapeCount + contents.textCount > 0, `${path.basename(fixture)} must create editable shapes or text.`);
  assert.ok(contents.animationCount > 0, `${path.basename(fixture)} must create an animation.`);
  return page.url().split('/').at(-1)!;
}
