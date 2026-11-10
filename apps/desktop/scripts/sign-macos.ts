// Electrobun build hook (`scripts.postBuild` and `scripts.postWrap`) that seals the macOS .app bundles.
//
// Without it only Contents/MacOS/launcher is signed (ad-hoc, by the linker). The bundle's Info.plist and
// Resources are then not covered, `codesign --verify` fails, and Gatekeeper reports the app as damaged with no
// "Open Anyway" button. Sealing the whole bundle ad-hoc makes the signature valid, so macOS shows the normal
// "unidentified developer" prompt instead (see docs/signing.md).
//
// Electrobun makes two bundles: the app itself, which goes into the update archive and the delta patches, and the
// wrapper that is installed from the DMG. The hook runs at both points and seals every .app it finds, so each
// artifact carries a valid signature. Sealing twice is harmless.
//
// OPENRIVE_MAC_SIGNING selects the mode (set by electrobun.config.ts and the Desktop workflow):
//   adhoc (default)  seal the bundles with an ad-hoc signature
//   developer-id     Electrobun signs and notarizes with the Developer ID certificate, nothing to do here
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

if (process.platform !== 'darwin') process.exit(0);

if (process.env.OPENRIVE_MAC_SIGNING === 'developer-id') {
  console.log('sign-macos: Developer ID signing is handled by Electrobun, skipping the ad-hoc seal');
  process.exit(0);
}

// what Electrobun tells the hook, for the build log (names only, plus the path-like values)
const names = Object.keys(process.env).filter((key) => key.startsWith('ELECTROBUN_')).sort();
const pathish = ['ELECTROBUN_BUILD_DIR', 'ELECTROBUN_WRAPPER_BUNDLE_PATH', 'ELECTROBUN_ARTIFACT_DIR'];
console.log(`sign-macos: hook environment: ${names.join(', ') || '(none)'}`);
for (const key of pathish) if (process.env[key]) console.log(`sign-macos: ${key}=${process.env[key]}`);

/** Every .app the build has made so far: the one Electrobun names plus any under the build folder. */
function findBundles(): string[] {
  const found = new Set<string>();
  const given = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
  if (given && existsSync(given)) found.add(path.resolve(given));
  const roots = [process.env.ELECTROBUN_BUILD_DIR, path.resolve('build')].filter((dir): dir is string => !!dir && existsSync(dir));
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      let isDirectory = false;
      try {
        isDirectory = statSync(full).isDirectory();
      } catch {
        continue; // a broken symlink
      }
      if (!isDirectory) continue;
      if (name.endsWith('.app')) found.add(path.resolve(full));
      else walk(full, depth + 1);
    }
  };
  for (const root of roots) walk(root, 0);
  return [...found];
}

const run = (args: string[]) => {
  const result = spawnSync('codesign', args, { encoding: 'utf8' });
  if (result.stdout) console.log(result.stdout.trim());
  if (result.stderr) console.log(result.stderr.trim());
  return result.status === 0;
};

const bundles = findBundles();
if (!bundles.length) {
  // an early hook can run before any bundle exists: nothing to seal yet
  console.log('sign-macos: no .app bundle exists yet, nothing to seal at this point');
  process.exit(0);
}

for (const bundle of bundles) {
  console.log(`sign-macos: sealing ${bundle} with an ad-hoc signature`);
  if (!run(['--force', '--deep', '--timestamp=none', '--sign', '-', bundle])) process.exit(1);
  if (!run(['--verify', '--deep', '--strict', '--verbose=2', bundle])) {
    console.error(`sign-macos: ${bundle} still fails codesign --verify`);
    process.exit(1);
  }
  console.log(`sign-macos: ${bundle} signature verified`);
}
