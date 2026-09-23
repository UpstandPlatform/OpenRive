import type { ElectrobunConfig } from 'electrobun';

export default {
  app: {
    name: 'OpenRive',
    identifier: 'dev.openrive.app',
    version: '0.1.0',
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
    mac: { bundleCEF: false, icons: 'assets/icon.iconset' },
    win: { bundleCEF: false, icon: 'assets/icon-win.png' },
    linux: { bundleCEF: false, icon: 'assets/icon.png' },
  },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
