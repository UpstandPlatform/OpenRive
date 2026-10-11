import { addImageAsset } from '@openrive/rive/assets';
import { zipSync } from 'fflate';
import { diagnoseDocument, diagnoseRiv } from '@openrive/rive/diagnostics';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { newDoc } from '@openrive/rive/factory';
import { exportSource, importSource, importSourceFiles, isOpenRiveSource } from '@openrive/rive/source';
import { DEFAULT_HEADER } from '@openrive/rive/riv-format';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const doc = newDoc('Source fixture');
addImageAsset(doc, 'illustration.png', new Uint8Array([0, 1, 2, 3, 255]), 1, 1);
doc.editor = { swatches: [], themes: [], activeThemeId: '', scripts: [{ id: 's1', name: 'hello', code: 'return 1' }] };
const originalRiv = exportRiv(doc);
const source = exportSource(doc);
assert(isOpenRiveSource(source), 'source archive signature');
const restored = importSource(source);
assert(JSON.stringify(restored.editor) === JSON.stringify(doc.editor), 'editor metadata round-trip');
assert(restored.top.some((o) => o.children?.some((c) => c.props.bytes instanceof Uint8Array && c.props.bytes.length === 5)), 'asset bytes round-trip');
assert(exportRiv(restored).every((byte, i) => byte === originalRiv[i]) && exportRiv(restored).length === originalRiv.length, 'Rive bytes round-trip');
const health = diagnoseRiv(originalRiv);
assert(health.valid && health.roundTripsByteIdentically, 'healthy Rive report');
assert(!diagnoseRiv(new Uint8Array([1, 2, 3])).valid, 'malformed Rive report');
const newerMinor = newDoc('Newer minor fixture');
newerMinor.header.minor = DEFAULT_HEADER.minor + 1;
assert(diagnoseDocument(newerMinor).diagnostics.some((diagnostic) => diagnostic.code === 'newer-runtime-format'), 'newer minor format compatibility warning');
const noStateMachine = newDoc('Static artboard');
noStateMachine.artboards[0]!.stateMachines = [];
const noStateMachineReport = diagnoseDocument(noStateMachine);
assert(noStateMachineReport.valid && noStateMachineReport.diagnostics.some((diagnostic) => diagnostic.code === 'no-state-machine' && diagnostic.location === 'Static artboard'), 'Flutter state-machine runtime compatibility hint');
const scriptModuleDoc = newDoc('Script module');
scriptModuleDoc.top.push({ id: 'script-module', type: 'ScriptModuleAsset', props: { name: 'Module' } });
assert(diagnoseDocument(scriptModuleDoc).diagnostics.some((diagnostic) => diagnostic.code === 'limited-scriptmoduleasset'), 'script module editability diagnostic');
let rejected = false;
try { importSource(new Uint8Array([1, 2, 3])); } catch { rejected = true; }
assert(rejected, 'invalid source archive rejection');
rejected = false;
try { importSource(zipSync({ '../escape': new Uint8Array([1]), 'openrive.json': new TextEncoder().encode('{}') })); } catch { rejected = true; }
assert(rejected, 'unsafe archive entry rejection');
rejected = false;
try {
  importSourceFiles({ 'openrive.json': new TextEncoder().encode(JSON.stringify({ format: 'openrive-source', version: 1, document: { header: {}, top: [], artboards: [] } })) });
} catch { rejected = true; }
assert(rejected, 'invalid source document schema rejection');
console.log('OpenRive source and diagnostics round-trip passed');
