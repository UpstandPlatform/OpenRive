import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { diagnoseRiv } from '@openrive/rive/diagnostics';

let checked = 0;
let failed = false;
for await (const file of new Glob('**/*.riv').scan({ cwd: 'apps/web/public/examples', absolute: true })) {
  checked++;
  const report = diagnoseRiv(new Uint8Array(readFileSync(file)));
  const errors = report.diagnostics.filter((item) => item.severity === 'error');
  if (!report.valid || report.roundTripsByteIdentically !== true) {
    failed = true;
    console.error(`✗ ${path.relative(process.cwd(), file)}`);
    for (const item of errors) console.error(`  ${item.code}: ${item.message}`);
    if (report.roundTripsByteIdentically === false) console.error('  .riv does not round-trip byte-identically');
  } else console.log(`✓ ${path.relative(process.cwd(), file)} (${report.counts.artboards} artboards)`);
}
if (!checked) throw new Error('No .riv examples were found to validate.');
if (failed) process.exitCode = 1;
else console.log(`Checked ${checked} shipped Rive example${checked === 1 ? '' : 's'}.`);
