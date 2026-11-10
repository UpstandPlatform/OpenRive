import type { ElectrobunConfig } from 'electrobun';

// Release signing, chosen by the Desktop workflow (docs/signing.md):
//   adhoc         default: scripts/sign-macos.ts seals the bundle so Gatekeeper shows "Open Anyway"
//   developer-id  Electrobun signs with the Developer ID certificate and notarizes with Apple
const developerId = process.env.OPENRIVE_MAC_SIGNING === 'developer-id';

export default {
  app: {
    name: 'OpenRive',
    identifier: 'dev.openrive.app',
    version: '0.2.6',
    description: 'Local-first editor for Rive (.riv) animations',
  },
  build: {
    // the Bun runtime is bundled: the main process runs the Next.js standalone server
    mainProcess: 'bun',
    bun: { entrypoint: 'src/bun/index.ts' },
    views: {
      mainview: { entrypoint: 'src/mainview/index.ts' },
    },
    copy: {
      'src/mainview/index.html': 'views/mainview/index.html',
      // produced by `bun run build:server` (Next.js standalone output)
      'build/server': 'server',
    },
    // app icons rendered from apps/web/public/logo.svg (see docs/desktop.md).
    // Windows needs 256x256: the ICO format cannot hold anything larger, and
    // Hutch rejects a bigger PNG with "invalid Windows PNG icon: PngTooLarge".
    mac: {
      bundleCEF: false,
      icons: 'assets/icon.iconset',
      codesign: developerId,
      notarize: developerId,
      // the hardened runtime Apple requires for notarization blocks what the bundled Bun runtime does at start-up
      ...(developerId
        ? {
            entitlements: {
              'com.apple.security.cs.allow-jit': true,
              'com.apple.security.cs.allow-unsigned-executable-memory': true,
              'com.apple.security.cs.disable-library-validation': true,
            },
          }
        : {}),
    },
    win: { bundleCEF: false, icon: 'assets/icon-win.png' },
    linux: { bundleCEF: false, icon: 'assets/icon.png' },
  },
  // the updater reads <baseUrl>/<platform>-update.json and the archives beside
  // it; GitHub's "latest" redirect always points at the newest release
  // seals the macOS bundles: the app before it goes into the update archive, and the installer wrapper before the
  // DMG is made (no-op on Windows and Linux)
  scripts: { postBuild: 'scripts/sign-macos.ts', postWrap: 'scripts/sign-macos.ts' },
  release: { baseUrl: 'https://github.com/UpstandPlatform/OpenRive/releases/latest/download' },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
