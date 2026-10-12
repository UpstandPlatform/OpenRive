import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'fflate';
import { newDoc } from '@openrive/rive/factory';
import { exportRiv } from '@openrive/rive/document';

const root = process.cwd();
const temp = mkdtempSync(path.join(os.tmpdir(), 'openrive-cli-workflow-'));
const dataDir = path.join(temp, 'data');
const rivPath = path.join(temp, 'fixture.riv');
const sourcePath = path.join(temp, 'fixture.oriv');
const sourceDir = path.join(temp, 'fixture-source');
const pngPath = path.join(temp, 'fixture.png');
const lottieJsonPath = path.join(temp, 'fixture.json');
const lottieTgsPath = path.join(temp, 'fixture.tgs');
writeFileSync(rivPath, exportRiv(newDoc('CLI fixture')));
const lottieFixture = {
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 30,
  w: 128,
  h: 128,
  layers: [{
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: 'Shape Layer',
    sr: 1,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [64, 64] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } },
    ip: 0,
    op: 30,
    st: 0,
    shapes: [
      { ty: 'rc', nm: 'Rectangle', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [48, 48] }, r: { a: 0, k: 0 } },
      { ty: 'fl', nm: 'Fill', c: { a: 0, k: [0.2, 0.6, 1, 1] }, o: { a: 0, k: 100 }, r: 1 },
      { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
    ],
  }],
};
const lottieBytes = new TextEncoder().encode(JSON.stringify(lottieFixture));
writeFileSync(lottieJsonPath, lottieBytes);
writeFileSync(lottieTgsPath, gzipSync(lottieBytes));

function run(...args: string[]) {
  const result = Bun.spawnSync([process.execPath, 'apps/cli/src/index.ts', ...args], {
    cwd: root,
    env: { ...process.env, OPENRIVE_DATA_DIR: dataDir, OPENRIVE_EDITION: 'local' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) throw new Error(`openrive ${args.join(' ')} failed:\n${result.stderr.toString()}\n${result.stdout.toString()}`);
  return result.stdout.toString();
}

function expectFailure(...args: string[]) {
  const result = Bun.spawnSync([process.execPath, 'apps/cli/src/index.ts', ...args], {
    cwd: root,
    env: { ...process.env, OPENRIVE_DATA_DIR: dataDir, OPENRIVE_EDITION: 'local' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode === 0) throw new Error(`openrive ${args.join(' ')} should fail for invalid input`);
  return `${result.stderr.toString()}\n${result.stdout.toString()}`;
}

try {
  const health = run('diagnose', rivPath, '--json');
  if (!health.includes('"valid": true')) throw new Error('CLI diagnostics did not mark a valid file healthy');
  const outline = run('info', rivPath, '--json');
  if (!outline.includes('CLI fixture')) throw new Error('CLI inspect did not report the artboard');
  run('render', rivPath, pngPath);
  const png = readFileSync(pngPath);
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('CLI render did not write a PNG');
  if (!expectFailure('render', rivPath, pngPath, '--scale', 'NaN').includes('--scale must be a finite')) throw new Error('CLI render should reject non-finite scale values');
  if (!expectFailure('render', rivPath, pngPath, '--time', '-1').includes('--time must be a finite')) throw new Error('CLI render should reject negative time values');
  if (!expectFailure('render', rivPath, pngPath, '--scale').includes('--scale requires')) throw new Error('CLI render should reject missing scale values');
  if (!expectFailure('render', rivPath, pngPath, '--scale', '5').includes('no greater than 4')) throw new Error('CLI render should reject unsafe scale values instead of silently clamping them');
  run('source', 'export', rivPath, sourcePath);
  run('validate', sourcePath);
  const sourceOutline = run('info', sourcePath, '--json');
  if (!sourceOutline.includes('CLI fixture')) throw new Error('CLI inspect did not read editable source');
  const imported = run('source', 'import', sourcePath, 'Imported CLI fixture');
  if (!imported.includes('Imported CLI fixture')) throw new Error('CLI source import did not create a project');
  run('source', 'export', rivPath, sourceDir);
  run('validate', sourceDir);
  if (!run('info', sourceDir, '--json').includes('CLI fixture')) throw new Error('CLI inspect did not read source folder');
  const folderImport = run('source', 'import', sourceDir, 'Imported folder fixture');
  if (!folderImport.includes('Imported folder fixture')) throw new Error('CLI source folder import did not create a project');
  const jsonImport = run('import', lottieJsonPath, '--name', 'Imported JSON fixture');
  if (!jsonImport.includes('Imported JSON fixture')) throw new Error('CLI Lottie JSON import did not create a project');
  const tgsImport = run('import', lottieTgsPath, '--name', 'Imported TGS fixture');
  if (!tgsImport.includes('Imported TGS fixture')) throw new Error('CLI Telegram TGS import did not create a project');
  const previousDataDir = process.env.OPENRIVE_DATA_DIR;
  const previousEdition = process.env.OPENRIVE_EDITION;
  process.env.OPENRIVE_DATA_DIR = dataDir;
  process.env.OPENRIVE_EDITION = 'local';
  const [{ closeDatabase, db, schema }, { importFile }] = await Promise.all([
    import('@openrive/db'),
    import('../apps/cli/src/project-store'),
  ]);
  try {
    const connection = await db();
    await connection.insert(schema.organizations).values({ id: 'cli-workflow-workspace', name: 'CLI workflow', slug: 'cli-workflow' });
    const workspaceImport = await importFile(lottieJsonPath, 'Workspace JSON fixture', undefined, 'cli-workflow-workspace');
    if (workspaceImport.organizationId !== 'cli-workflow-workspace') {
      throw new Error('CLI Lottie JSON import did not preserve the selected workspace');
    }
  } finally {
    await closeDatabase();
    if (previousDataDir === undefined) delete process.env.OPENRIVE_DATA_DIR;
    else process.env.OPENRIVE_DATA_DIR = previousDataDir;
    if (previousEdition === undefined) delete process.env.OPENRIVE_EDITION;
    else process.env.OPENRIVE_EDITION = previousEdition;
  }
  console.log('CLI diagnose, inspect, render, editable source export/import, Lottie JSON and TGS imports, and workspace import passed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
