// Builds the GitHub wiki from the repo docs.
//
//   node scripts/build-wiki.mjs [outDir]      (default: .wiki)
//
// - wiki/*.md           hand-written, wiki-only pages (Home, sidebar, tutorials, FAQ…), copied as is
// - docs/, contribution/ converted into wiki pages: links between docs become wiki links, links to other
//                       repo files become GitHub URLs, and each page gets an "edit the source" footer
//
// Every internal wiki link is checked; the build fails on broken ones. Publish by pushing the output
// folder to https://github.com/UpstandPlatform/OpenRive.wiki.git (see .github/workflows/wiki.yml).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const REPO = 'UpstandPlatform/OpenRive';
const BRANCH = 'main';
const OUT = path.resolve(ROOT, process.argv[2] ?? '.wiki');

/** repo-relative source → wiki page name */
const PAGES = {
  'docs/running-locally.md': 'Running-Locally',
  'docs/self-hosting.md': 'Self-Hosting',
  'docs/desktop.md': 'Desktop-App',
  'docs/configuration.md': 'Configuration',
  'docs/storage.md': 'Storage-and-PostgreSQL',
  'docs/user-guide.md': 'User-Guide',
  'docs/shortcuts.md': 'Keyboard-Shortcuts',
  'docs/templates.md': 'Templates',
  'docs/theme-colors.md': 'Theme-Colors',
  'docs/data-binding.md': 'Data-Binding',
  'docs/text-and-assets.md': 'Text-and-Assets',
  'docs/code-panel.md': 'Code-Panel',
  'docs/preview-bundles.md': 'Preview-Bundles',
  'docs/users.md': 'Users-and-Roles',
  'docs/cli.md': 'CLI',
  'docs/mcp.md': 'MCP-Server',
  'docs/rest-api.md': 'REST-API',
  'docs/architecture.md': 'Architecture',
  'docs/file-format.md': 'File-Format',
  'docs/rive-sdk.md': 'Rive-SDK-Submodules',
  'docs/troubleshooting.md': 'Troubleshooting',
  'CONTRIBUTING.md': 'Contributing',
  'contribution/README.md': 'Contribution-Guides',
  'contribution/development.md': 'Development',
  'contribution/code-style.md': 'Code-Style',
  'contribution/testing.md': 'Testing',
  'contribution/templates.md': 'Building-Templates',
  'contribution/docs.md': 'Writing-Docs',
  'contribution/ai-collaboration.md': 'AI-Collaboration',
  'contribution/pull-requests.md': 'Pull-Requests',
};
/** pages that point to the wiki home instead */
const ALIASES = { 'docs/README.md': 'Home', 'README.md': 'Home' };

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
const toPosix = (p) => p.split(path.sep).join('/');

function rewriteLinks(md, sourceRel) {
  const dir = path.posix.dirname(sourceRel);
  // skip fenced code blocks
  return md
    .split(/(```[\s\S]*?```)/g)
    .map((chunk, i) =>
      i % 2
        ? chunk
        : chunk.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (all, bang, text, target) => {
            if (/^(https?:|mailto:|#)/.test(target)) return all;
            const [file, anchor] = target.split('#');
            const rel = path.posix.normalize(path.posix.join(dir, file));
            const hash = anchor ? `#${anchor}` : '';
            const page = PAGES[rel] ?? ALIASES[rel];
            // link text that is just the source path reads better as the page title
            if (page && !bang) return `[${/\.md$/.test(text) ? page.replace(/-/g, ' ') : text}](${page}${hash})`;
            if (bang || IMAGE.test(rel)) return `${bang}[${text}](https://raw.githubusercontent.com/${REPO}/${BRANCH}/${rel})`;
            const abs = path.join(ROOT, rel);
            const isDir = existsSync(abs) && statSync(abs).isDirectory();
            return `[${text}](https://github.com/${REPO}/${isDir ? 'tree' : 'blob'}/${BRANCH}/${rel}${hash})`;
          }),
    )
    .join('');
}

function convert(sourceRel) {
  let md = readFileSync(path.join(ROOT, sourceRel), 'utf8').replace(/\r\n/g, '\n');
  // the wiki shows the page name as the title
  md = md.replace(/^# .*\n+/, '');
  md = rewriteLinks(md, sourceRel);
  return (
    `<!-- Generated from ${sourceRel} by scripts/build-wiki.mjs. Edit the source file, not this page. -->\n\n` +
    md.trimEnd() +
    `\n\n---\n\n<sub>This page is generated from [\`${sourceRel}\`](https://github.com/${REPO}/blob/${BRANCH}/${sourceRel}). ` +
    `[Suggest an edit](https://github.com/${REPO}/edit/${BRANCH}/${sourceRel}).</sub>\n`
  );
}

// ---------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const written = new Map();

for (const [src, page] of Object.entries(PAGES)) {
  if (!existsSync(path.join(ROOT, src))) throw new Error(`Missing source ${src}`);
  written.set(page, convert(src));
}
const handDir = path.join(ROOT, 'wiki');
for (const f of readdirSync(handDir).filter((f) => f.endsWith('.md'))) {
  const page = f.slice(0, -3);
  if (written.has(page)) throw new Error(`wiki/${f} collides with a generated page`);
  written.set(page, readFileSync(path.join(handDir, f), 'utf8').replace(/\r\n/g, '\n'));
}

// check internal links: [text](Page) or [text](Page#anchor), and [[Page]] / [[Text|Page]]
const broken = [];
for (const [page, md] of written) {
  const body = md.replace(/```[\s\S]*?```/g, '');
  for (const m of body.matchAll(/\]\(([A-Za-z0-9_.-]+)(#[^)]*)?\)/g)) {
    if (!written.has(m[1]) && !IMAGE.test(m[1])) broken.push(`${page} → ${m[1]}`);
  }
  for (const m of body.matchAll(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g)) {
    if (!written.has(m[1].replace(/ /g, '-'))) broken.push(`${page} → [[${m[1]}]]`);
  }
}
if (broken.length) {
  console.error(`Broken wiki links:\n  ${broken.join('\n  ')}`);
  process.exit(1);
}

for (const [page, md] of written) writeFileSync(path.join(OUT, `${page}.md`), md);
console.log(`Wrote ${written.size} wiki pages to ${toPosix(path.relative(ROOT, OUT)) || '.'}`);
