// Compiles the .rml scenes in rive-runtime's tests and compares them with the
// .riv files the Rive CLI built from them (`rive . --unsigned-riv`).
//   bun run test:rml-corpus -- <rive-runtime>/tests
// Scenes with Luau scripts are skipped: the runtime only plays scripts Rive
// signed. Files built by older CLI releases differ in small editor defaults, so
// only the ones listed in CURRENT must be byte-identical.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';
import { exportRiv } from '@openrive/rive/document';
import { importRml } from '@openrive/rive/rml';
import { readRiv } from '@openrive/rive/riv-format';

/** Pairs built by the current CLI (2026-11-16 onwards). */
const CURRENT = [
  'bind_walk_skip',
  'decoded_game_guest',
  'nested_remap_time_lag',
  'node_bounds',
  'quiet_style_rows',
  'text_input_scroll',
  'text_style_global_decoration',
  'virtualized_focus_rows',
  'virtualized_list_display_none',
];

const dir = process.argv[2];
if (!dir) throw new Error('Usage: bun run test:rml-corpus -- <rive-runtime>/tests');
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.rml') ? [join(d, f)] : []));
// The scenes name their fonts by short aliases (see each file's header comment).
const fonts: Record<string, string> = {
  'Inter.ttf': join(dir, 'unit_tests/assets/fonts/Inter_18pt-Regular.ttf'),
  'label_font.ttf': join(dir, 'web_scripting/stress/text/label_font.ttf'),
};

let total = 0;
const identical: string[] = [];
const sameObjects: string[] = [];
const differ: string[] = [];
for (const file of walk(dir).sort()) {
  const src = readFileSync(file, 'utf8');
  // scripted scenes need Rive's signature; bare fragments aren't CLI projects
  if (/<Script|<Scripted/.test(src) || !/<Rive[\s>]/.test(src)) continue;
  const name = basename(file) === 'scene.rml' ? basename(dirname(file)) : basename(file, '.rml');
  const rivPath = [join(dirname(file), '..', `${name}.riv`), join(dirname(file), `${name}.riv`), join(dirname(file), '..', '..', `${name}.riv`)].find(existsSync);
  if (!rivPath) continue;
  total++;
  const main = (() => {
    const yaml = join(dirname(file), 'rive.yaml');
    return existsSync(yaml) ? /^main:\s*(.+)$/m.exec(readFileSync(yaml, 'utf8'))?.[1]?.trim() : undefined;
  })();
  const { doc } = importRml(src, {
    main,
    readFile: (f) => {
      const p = existsSync(join(dirname(file), f)) ? join(dirname(file), f) : fonts[f];
      return p && existsSync(p) ? new Uint8Array(readFileSync(p)) : undefined;
    },
  });
  const out = exportRiv(doc);
  const ref = new Uint8Array(readFileSync(rivPath));
  if (Buffer.from(out).equals(Buffer.from(ref))) identical.push(name);
  else if (JSON.stringify(readRiv(out).objects) === JSON.stringify(readRiv(ref).objects)) sameObjects.push(name);
  else differ.push(name);
}

console.log({ total, identical: identical.length, sameObjects: sameObjects.length, differ: differ.length });
if (differ.length) console.log('built by older CLI releases or not matched yet:', differ.join(', '));
const missing = CURRENT.filter((n) => !identical.includes(n));
if (missing.length) {
  console.error('not byte-identical to the Rive CLI:', missing.join(', '));
  process.exit(1);
}
console.log(`all ${CURRENT.length} scenes built by the current Rive CLI compile byte-identically`);
