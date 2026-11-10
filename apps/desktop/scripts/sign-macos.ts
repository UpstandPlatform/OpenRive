// Electrobun `scripts.postWrap` hook: runs right after the macOS .app is wrapped and before the update bundle, the
// delta patches and the DMG are made from it, so everything shipped carries the same signature.
//
// Without it only Contents/MacOS/launcher is signed (ad-hoc, by the linker). The bundle's Info.plist and
// Resources are then not covered, `codesign --verify` fails, and Gatekeeper reports the app as damaged with no
// "Open Anyway" button. Sealing the whole bundle ad-hoc makes the signature valid, so macOS shows the normal
// "unidentified developer" prompt instead (see docs/signing.md).
//
// OPENRIVE_MAC_SIGNING selects the mode (set by electrobun.config.ts and the Desktop workflow):
//   adhoc (default)  seal the bundle with an ad-hoc signature
//   developer-id     Electrobun signs and notarizes with the Developer ID certificate, nothing to do here
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

if (process.platform !== 'darwin') process.exit(0);

if (process.env.OPENRIVE_MAC_SIGNING === 'developer-id') {
  console.log('sign-macos: Developer ID signing is handled by Electrobun, skipping the ad-hoc seal');
  process.exit(0);
}

/** The .app Electrobun just wrapped: the path it passes to hooks, else the first .app under the build folder. */
function findBundle(): string | null {
  const given = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
  if (given && existsSync(given)) return given;
  const root = process.env.ELECTROBUN_BUILD_DIR ?? path.resolve('build');
  const walk = (dir: string, depth: number): string | null => {
    if (depth > 3 || !existsSync(dir)) return null;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name.endsWith('.app') && statSync(full).isDirectory()) return full;
      if (statSync(full).isDirectory() && !name.endsWith('.app')) {
        const found = walk(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root, 0);
}

const run = (args: string[]) => {
  const result = spawnSync('codesign', args, { encoding: 'utf8' });
  if (result.stdout) console.log(result.stdout.trim());
  if (result.stderr) console.log(result.stderr.trim());
  return result.status === 0;
};

const bundle = findBundle();
if (!bundle) {
  console.error('sign-macos: could not find the .app bundle to sign (ELECTROBUN_WRAPPER_BUNDLE_PATH / ELECTROBUN_BUILD_DIR)');
  process.exit(1);
}

console.log(`sign-macos: sealing ${bundle} with an ad-hoc signature`);
if (!run(['--force', '--deep', '--timestamp=none', '--sign', '-', bundle])) process.exit(1);
if (!run(['--verify', '--deep', '--strict', '--verbose=2', bundle])) {
  console.error('sign-macos: the bundle still fails codesign --verify');
  process.exit(1);
}
console.log('sign-macos: bundle signature verified');
