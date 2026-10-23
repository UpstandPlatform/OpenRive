// Real pointer and Inspector regression checks against an isolated local editor.
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { newDoc } from '@openrive/rive/factory';
import { addBone, addPath, addSkin } from '@openrive/rive/api';
import { exportRiv } from '@openrive/rive/document';
import { childrenOf } from '@openrive/rive/ops';
import { stringifyDoc } from '@openrive/shared/serialize';
import type { useEditor } from '../apps/web/src/lib/store/editor';

declare global {
  interface Window {
    __riveEditor: typeof useEditor;
  }
}

const scratch = mkdtempSync(path.join(tmpdir(), 'openrive-bone-browser-'));
const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
const port = portProbe.port!;
portProbe.stop(true);
const origin = `http://127.0.0.1:${port}`;
const server = Bun.spawn(
  // Use the app's Webpack dev script so Next selects its supported Node runtime.
  // This browser test exercises editor interactions, not Turbopack's HMR; the
  // latter can repeatedly reload a cold editor route while its lazy chunks compile in CI.
  [process.execPath, 'run', 'dev:webpack', '--port', String(port), '--hostname', '127.0.0.1'],
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
    stdout: 'pipe',
    stderr: 'pipe',
  },
);
const serverOutput: string[] = [];
const captureServerOutput = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    serverOutput.push(decoder.decode(value, { stream: true }));
    // Keep the diagnostic bounded if a dev server gets into a noisy loop.
    while (serverOutput.join('').length > 20_000) serverOutput.shift();
  }
};
void captureServerOutput(server.stdout);
void captureServerOutput(server.stderr);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let scenarios = 0;
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
  const doc = newDoc('Bone browser QA'),
    ab = doc.artboards[0]!;
  const root = addBone(doc, { name: 'Shoulder', x: 100, y: 200, length: 120 });
  const child = addBone(doc, { name: 'Elbow', parent: root.id, length: 100 });
  const shape = addPath(doc, {
    name: 'Ribbon',
    x: 100,
    y: 185,
    points: [
      { x: 0, y: 0 },
      { x: 220, y: 0 },
      { x: 220, y: 30 },
      { x: 0, y: 30 },
    ],
    closed: true,
    fill: '#45a9dc',
  });
  const contour = childrenOf(ab, shape.id).find((object) => object.type === 'PointsPath')!;
  addSkin(doc, { path: contour.id, bones: [root.id, child.id] });
  const response = await fetch(`${origin}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ name: 'Bone browser QA', doc: stringifyDoc(doc), riv: Buffer.from(exportRiv(doc)).toString('base64') }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const project = (await response.json()) as { id: string };
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const requestEvents: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest() || request.resourceType() === 'script') {
      requestEvents.push(`${request.method()} ${request.resourceType()} ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    if (response.request().isNavigationRequest() || response.request().resourceType() === 'script') {
      requestEvents.push(`${response.status()} ${response.request().resourceType()} ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`));
  const describePage = () =>
    page.evaluate(() => ({
      href: location.href,
      readyState: document.readyState,
      title: document.title,
      body: document.body.innerText.slice(0, 1000),
      storeLoaded: !!window.__riveEditor,
      documentLoaded: !!window.__riveEditor?.getState().doc,
    }));
  const waitForEditor = async (stage: string) => {
    try {
      // A cold Turbopack compile on a busy CI runner can take longer than the
      // default Playwright timeout even though the editor is healthy.
      await page.waitForFunction(() => !!window.__riveEditor?.getState().doc, null, { timeout: 90_000 });
    } catch (error) {
      const details = await describePage().catch(() => ({ href: page.url(), readyState: 'unavailable', title: '', body: '', storeLoaded: false, documentLoaded: false }));
      throw new Error(
        `Editor did not hydrate during ${stage}: ${JSON.stringify({ details, errors, consoleErrors, failedRequests, requestEvents: requestEvents.slice(-80), serverOutput: serverOutput.join('').slice(-20_000), cause: (error as Error).message })}`,
      );
    }
  };
  await page.goto(`${origin}/editor/${project.id}`);
  await waitForEditor('initial load');
  for (const label of ['Expand inspector', 'Expand left sidebar']) {
    const button = page.getByRole('button', { name: label, exact: true });
    if (await button.count()) await button.click();
  }
  await page.evaluate(() => window.__riveEditor.getState().set('view', { zoom: 1, panX: 100, panY: 100 }));
  const stage = (await page.locator('canvas').boundingBox())!;
  const point = (x: number, y: number) => ({ x: stage.x + 100 + x, y: stage.y + 100 + y });
  const drag = async (a: ReturnType<typeof point>, b: ReturnType<typeof point>) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  };
  const state = () =>
    page.evaluate(() => {
      const s = window.__riveEditor.getState();
      return {
        root: s.doc!.artboards[0]!.objects.find((object) => object.props.name === 'Shoulder')!.props,
        past: s.past.length,
        gesture: !!s.gestureStart,
        weights: s.doc!.artboards[0]!.objects.filter((object) => object.type === 'Weight').map((object) => object.props),
      };
    });
  const check = (condition: unknown, label: string) => {
    assert.ok(condition, label);
    scenarios++;
    console.log(`✓ browser: ${label}`);
  };
  const layers = page.getByRole('complementary', { name: 'Layers, theme, and assets' });
  const before = await state();
  await drag(point(103, 202), point(123, 212));
  let after = await state();
  check(after.root.x === 120 && after.root.y === 210, 'root drag retains handle grab offset');
  check(after.past === before.past + 1 && !after.gesture, 'drag produces one undo step');
  await page.keyboard.press('Control+z');
  after = await state();
  check(after.root.x === 100 && after.root.y === 200, 'undo restores root and linked rig');
  await layers.getByText('Shoulder', { exact: true }).click();
  await drag(point(223, 203), point(223, 263));
  after = await state();
  check(
    Math.abs(Number(after.root.length) - Math.hypot(120, 60)) < 0.01 && Math.abs(Number(after.root.rotation) - Math.atan2(60, 120)) < 0.0001,
    'tip drag edits length and angle without jumping',
  );
  await page.keyboard.press('Control+z');
  await drag(point(160, 200), point(100, 260));
  after = await state();
  check(Math.abs(Number(after.root.rotation) - Math.PI / 2) < 0.0001, 'shaft rotates around its joint');
  await layers.getByText('Path', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit vertices', exact: true }).click();
  const vertex = page.locator('[data-vertex][data-which="pt"]').first();
  const handleBefore = (await vertex.boundingBox())!;
  await drag({ x: handleBefore.x + 4, y: handleBefore.y + 4 }, { x: handleBefore.x + 19, y: handleBefore.y + 14 });
  const handleAfter = (await vertex.boundingBox())!;
  check(
    Math.abs(handleAfter.x - handleBefore.x - 15) < 0.1 && Math.abs(handleAfter.y - handleBefore.y - 10) < 0.1,
    'deformed vertex follows the pointer in bone space',
  );
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.evaluate(() => window.__riveEditor.getState().set('editPathId', null));
  await page.mouse.move(point(100, 200).x, point(100, 200).y);
  await page.mouse.down();
  await page.mouse.move(point(140, 220).x, point(140, 220).y, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  after = await state();
  check(after.root.x === 100 && after.root.y === 200 && !after.gesture, 'Escape abandons an interrupted drag');
  await page.getByRole('button', { name: 'Bone (B)', exact: true }).click();
  await drag(point(320, 200), point(360, 260));
  check(
    await page.evaluate(
      (parent) => window.__riveEditor.getState().doc!.artboards[0]!.objects.some((object) => object.type === 'Bone' && object.props.parentId === parent),
      child.id,
    ),
    'Bone tool links from an unselected endpoint',
  );
  await page.keyboard.press('Control+z');
  await layers.getByText('Elbow', { exact: true }).click();
  await page.getByLabel('Bone parent', { exact: true }).selectOption('');
  check(
    await page.evaluate((id) => {
      const bone = window.__riveEditor.getState().doc!.artboards[0]!.objects.find((object) => object.id === id)!;
      return bone.type === 'RootBone' && bone.props.x === 220 && bone.props.y === 200;
    }, child.id),
    'Inspector detaches a bone at its current position',
  );
  await page.getByLabel('Bone parent', { exact: true }).selectOption(root.id);
  check(
    await page.evaluate((id) => window.__riveEditor.getState().doc!.artboards[0]!.objects.find((object) => object.id === id)!.type === 'Bone', child.id),
    'Inspector links the joint back to its parent',
  );
  await layers.getByText('Path', { exact: true }).click();
  await page.getByRole('button', { name: 'Paint weights (Shift B)', exact: true }).click();
  await page.getByLabel('Paint bone', { exact: true }).selectOption({ label: 'Elbow' });
  const paintBefore = await state();
  await drag(point(100, 185), point(100, 215));
  after = await state();
  check(JSON.stringify(after.weights) !== JSON.stringify(paintBefore.weights), 'canvas brush changes vertex influences');
  check(after.past === paintBefore.past + 1, 'paint stroke produces one undo step');
  check(
    after.weights.every((weight) => [0, 8, 16, 24].reduce((sum, shift) => sum + ((Number(weight.values) >>> shift) & 255), 0) === 255),
    'painting normalizes all byte weights',
  );
  await page.keyboard.press('Control+z');
  check(JSON.stringify((await state()).weights) === JSON.stringify(paintBefore.weights), 'undo restores the complete paint stroke');
  await page.getByRole('button', { name: 'Finish painting', exact: true }).click();
  // Read-only sessions and Animate mode must disable structural rigging changes.
  await page.evaluate(() => window.__riveEditor.getState().set('readOnly', true));
  check(await page.getByRole('button', { name: 'Paint weights (Shift B)', exact: true }).isDisabled(), 'read-only sessions disable weight authoring');
  const locked = await state();
  await drag(point(100, 200), point(140, 220));
  check(JSON.stringify((await state()).root) === JSON.stringify(locked.root), 'read-only canvas cannot move bones');
  await page.evaluate(() => {
    const s = window.__riveEditor.getState();
    s.set('readOnly', false);
    s.set('mode', 'animate');
  });
  check(await page.getByRole('button', { name: 'Rebind pose', exact: true }).isDisabled(), 'Animate mode disables bind-pose changes');
  await page.evaluate(() => window.__riveEditor.getState().set('mode', 'design'));
  await page.getByRole('button', { name: 'Auto weight', exact: true }).click();
  await page.getByRole('button', { name: 'Smooth weights', exact: true }).click();
  await page.getByRole('button', { name: 'Rebind pose', exact: true }).click();
  check((await state()).weights.length === 4, 'auto weight, smooth, and rebind retain the rig');
  await page.getByRole('button', { name: 'Unbind skin', exact: true }).click();
  check((await state()).weights.length === 0, 'unbind removes all vertex skin weights');
  await page.getByRole('button', { name: 'Bind selected bones', exact: true }).click();
  check((await state()).weights.length === 4, 'Inspector binds the path again');
  await page.getByRole('button', { name: 'Edit vertices', exact: true }).click();
  await page.locator('[data-vertex][data-which="pt"]').first().click();
  const addInfluence = page.getByRole('combobox', { name: 'Add bone influence', exact: true });
  await addInfluence.selectOption('0');
  check(await page.getByRole('combobox', { name: 'Influence 2 bone', exact: true }).count(), 'Inspector can add the unbound identity influence');
  const slider = page.getByRole('slider', { name: 'Influence 1 weight', exact: true });
  await slider.fill('50');
  check((await state()).weights.every((weight) => unpackByteSum(Number(weight.values)) === 255), 'Inspector weight slider keeps normalized byte weights');
  await page.getByText('All changes saved', { exact: true }).waitFor();
  await page.reload();
  await waitForEditor('reload');
  check((await state()).weights.length === 4, 'saved rig survives an editor reload');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4)
      if (Math.abs(pixels[i]! - 69) < 3 && Math.abs(pixels[i + 1]! - 169) < 3 && Math.abs(pixels[i + 2]! - 220) < 3 && pixels[i + 3] === 255) return true;
    return false;
  });
  check(true, 'official runtime renders the saved skinned contour after reload');
  const screenshots = path.resolve(import.meta.dir, '../output/playwright');
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, 'bone-browser-desktop.png') });
  await page.setViewportSize({ width: 1024, height: 768 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'editor shell fits a narrower desktop viewport');
  await page.screenshot({ path: path.join(screenshots, 'bone-browser-narrow.png') });
  assert.deepEqual(errors, [], 'editor has no browser runtime exceptions');
  console.log(`Passed ${scenarios} real browser rigging scenarios.`);
} finally {
  await browser?.close();
  // Next's launcher forks its server; terminate the entire scratch process tree.
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

function unpackByteSum(value: number) {
  return [0, 8, 16, 24].reduce((sum, shift) => sum + ((value >>> shift) & 255), 0);
}
