// `file="…"` on an asset reads a file from the project folder. It must never read outside it, whatever the markup says.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadRml } from '../apps/cli/src/project-store';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const base = mkdtempSync(path.join(tmpdir(), 'openrive-rml-assets-'));
try {
  const project = path.join(base, 'project');
  mkdirSync(path.join(project, 'assets'), { recursive: true });
  writeFileSync(path.join(project, 'assets', 'ok.png'), 'png');
  writeFileSync(path.join(project, '..dotted.png'), 'png'); // a legitimate name that merely starts with two dots
  writeFileSync(path.join(base, 'outside.png'), 'secret');

  const asset = (file: string) => `<ImageAsset name="a" id="9:${file.length}" file="${file}"/>`;
  const scene = (files: string[]) =>
    `<Rive version="1" kind="fragment">\n  ${files.map(asset).join('\n  ')}\n  <Artboard width="10" height="10" name="A" id="0:1"/>\n</Rive>`;
  const load = (files: string[]) => {
    writeFileSync(path.join(project, 'scene.rml'), scene(files));
    return loadRml(project);
  };
  const missing = (warnings: string[], file: string) => warnings.some((w) => w.includes(`file ${file} not found`));

  const outsideAbsolute = path.join(base, 'outside.png').replaceAll('\\', '/');
  const { warnings } = load(['assets/ok.png', '..dotted.png', '../outside.png', outsideAbsolute, 'assets/../../outside.png', 'assets']);
  assert(!missing(warnings, 'assets/ok.png'), 'a file inside the project is read');
  assert(!missing(warnings, '..dotted.png'), 'a file whose name starts with two dots is inside the project');
  assert(missing(warnings, '../outside.png'), 'a parent folder is out of bounds');
  assert(missing(warnings, outsideAbsolute), 'an absolute path is out of bounds');
  assert(missing(warnings, 'assets/../../outside.png'), 'a path that climbs out is out of bounds');
  assert(missing(warnings, 'assets'), 'a folder is not an asset');

  // a link inside the project that points outside it is out of bounds as well (creating links needs privileges on Windows)
  let linked = false;
  try {
    symlinkSync(path.join(base, 'outside.png'), path.join(project, 'assets', 'link.png'));
    linked = true;
  } catch {
    console.log('skipping the symlink check: symbolic links are not available here');
  }
  if (linked) assert(missing(load(['assets/link.png']).warnings, 'assets/link.png'), 'a symlink that leaves the project is out of bounds');
} finally {
  rmSync(base, { recursive: true, force: true });
}

console.log('rml asset path tests passed');
