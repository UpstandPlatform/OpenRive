// Stamps a version into the desktop app before packaging.
//
//   bun scripts/set-desktop-version.ts 0.2.0
//
// Releases are tag-driven: the Desktop workflow computes the next version and
// stamps it here, so installers carry the same version as the GitHub release
// without a version-bump commit in the repository.
import path from 'node:path';
import { stampVersion } from './desktop-version';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('usage: bun scripts/set-desktop-version.ts <major.minor.patch[-prerelease]>');
  process.exit(1);
}

const root = path.resolve(import.meta.dir, '..');
const files = [
  { file: path.join(root, 'apps', 'desktop', 'electrobun.config.ts'), pattern: /(\bversion:\s*)(')[^']*\2/ },
  { file: path.join(root, 'apps', 'desktop', 'package.json'), pattern: /(\"version\":\s*)(\")[^\"]*\2/ },
  { file: path.join(root, 'package.json'), pattern: /(\"version\":\s*)(\")[^\"]*\2/ },
];

for (const { file, pattern } of files) {
  const before = await Bun.file(file).text();
  let after: string;
  try {
    after = stampVersion(before, pattern, version, path.relative(root, file));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (after !== before) await Bun.write(file, after);
  console.log(`${path.relative(root, file)} → ${version}`);
}
