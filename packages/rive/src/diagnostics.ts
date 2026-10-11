/** File health checks shared by the editor, CLI, API and MCP integrations. */
import { assetBytes, fileAssets } from './assets';
import { exportRiv, importRiv, type CoreObj, type RiveDoc } from './document';
import { DEFAULT_HEADER } from './riv-format';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export interface FileDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  title: string;
  message: string;
  location?: string;
  fix?: string;
}
export interface FileHealthReport {
  valid: boolean;
  fileVersion: string | null;
  roundTripsByteIdentically: boolean | null;
  counts: { artboards: number; objects: number; timelines: number; stateMachines: number; assets: number };
  diagnostics: FileDiagnostic[];
}

function walk(objects: CoreObj[], visit: (o: CoreObj) => void) {
  for (const o of objects) {
    visit(o);
    if (o.children) walk(o.children, visit);
  }
}

const preservedButNotFullyEditable = new Map<string, string>([
  ['Bone', 'Root and child bones can be authored; broader rigging controls are still limited.'],
  ['Skin', 'PointsPath skins and vertex weights are editable; mesh skin editing is still limited.'],
  ['Mesh', 'Mesh data is preserved and playable, but mesh editing is not available yet.'],
  ['NestedArtboard', 'Nested artboards are preserved and playable, but their editing controls are limited.'],
  ['LayoutComponent', 'Layout data is preserved and playable, but layout editing is not available yet.'],
  ['ViewModel', 'Data binding is preserved; inspect the Data panel to review editable properties.'],
  ['ScriptAsset', 'Scripts are preserved but require a compatible Rive runtime and are not editable here.'],
  ['ScriptModuleAsset', 'Script modules are preserved but require a compatible Rive runtime and are not editable here.'],
]);

export function diagnoseDocument(doc: RiveDoc): FileHealthReport {
  const diagnostics: FileDiagnostic[] = [];
  let objectCount = 0;
  const ids = new Set<string>();
  const seenIds = new Set<string>();
  const all: CoreObj[] = [...doc.top];
  for (const ab of doc.artboards) {
    all.push(ab.artboard, ...ab.objects, ...ab.animations, ...ab.stateMachines);
    if (ab.stateMachines.length === 0) {
      diagnostics.push({
        code: 'no-state-machine',
        severity: 'info',
        title: 'No state machine on this artboard',
        message: 'The file can still be loaded and preserved. Flutter 0.14.11’s RiveWidgetController requires a state machine to render an artboard; add one or use a runtime API that supports your timeline or static-artboard workflow.',
        location: String(ab.artboard.props.name || 'Artboard'),
      });
    }
  }
  walk(all, (o) => {
    objectCount++;
    if (seenIds.has(o.id)) diagnostics.push({ code: 'duplicate-object-id', severity: 'error', title: 'Duplicate object identity', message: `More than one object uses the internal id ${o.id}.` });
    seenIds.add(o.id);
    ids.add(o.id);
  });

  walk(all, (o) => {
    for (const [key, value] of Object.entries(o.props)) {
      if (!key.endsWith('Id') || typeof value !== 'string' || !value || ids.has(value)) continue;
      const parent = key === 'parentId';
      diagnostics.push({
        code: parent ? 'missing-parent' : 'missing-reference',
        severity: 'error',
        title: parent ? 'Missing parent object' : 'Broken object reference',
        message: `“${String(o.props.name || o.type)}” refers to a missing ${parent ? 'parent object' : key.slice(0, -2)}.`,
      });
    }
  });

  const assetIds = new Set(fileAssets(doc).map((o) => o.id));
  const referencedAssets = new Set<string>();
  walk(all, (o) => {
    if (typeof o.props.assetId === 'string' && o.props.assetId) referencedAssets.add(o.props.assetId);
    if (o.type.startsWith('#')) diagnostics.push({ code: 'unknown-object', severity: 'warning', title: 'Object not recognized', message: `${o.type} is not in this editor’s object model. OpenRive will preserve it, but cannot inspect or edit it.` });
    if (o.raw?.length) diagnostics.push({ code: 'unknown-properties', severity: 'info', title: 'Unrecognized properties preserved', message: `${String(o.props.name || o.type)} contains ${o.raw.length} properties this editor does not edit. They will be preserved when possible.` });
    const note = preservedButNotFullyEditable.get(o.type);
    if (note) diagnostics.push({ code: `limited-${o.type.toLowerCase()}`, severity: 'info', title: `${o.type} has limited editing support`, message: note });
  });
  for (const id of referencedAssets) {
    if (!assetIds.has(id)) diagnostics.push({ code: 'missing-asset', severity: 'error', title: 'Missing asset', message: `An object refers to asset ${id}, but that asset is absent from the file.` });
  }
  for (const asset of fileAssets(doc)) {
    const bytes = assetBytes(asset);
    if (!bytes && referencedAssets.has(asset.id)) diagnostics.push({ code: 'external-asset', severity: 'warning', title: 'Asset is externally hosted', message: `“${String(asset.props.name || 'Asset')}” has no embedded data. The app using this file must provide the asset at runtime.` });
    else if (bytes?.length === 0) diagnostics.push({ code: 'empty-asset', severity: 'error', title: 'Asset has no data', message: `“${String(asset.props.name || 'Asset')}” is present but contains no bytes.` });
  }
  if (doc.header.major > DEFAULT_HEADER.major || (doc.header.major === DEFAULT_HEADER.major && doc.header.minor > DEFAULT_HEADER.minor)) {
    diagnostics.push({ code: 'newer-runtime-format', severity: 'warning', title: 'Newer Rive format version', message: `This file uses Rive format ${doc.header.major}.${doc.header.minor}; OpenRive currently writes ${DEFAULT_HEADER.major}.${DEFAULT_HEADER.minor}. Some newer features may only be preserved, not edited.` });
  }

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  return {
    valid: errors === 0,
    fileVersion: `${doc.header.major}.${doc.header.minor}`,
    roundTripsByteIdentically: null,
    counts: {
      artboards: doc.artboards.length,
      objects: objectCount,
      timelines: doc.artboards.reduce((n, a) => n + a.animations.length, 0),
      stateMachines: doc.artboards.reduce((n, a) => n + a.stateMachines.length, 0),
      assets: fileAssets(doc).length,
    },
    diagnostics,
  };
}

export function diagnoseRiv(bytes: Uint8Array): FileHealthReport {
  try {
    const doc = importRiv(bytes);
    const report = diagnoseDocument(doc);
    const encoded = exportRiv(doc);
    report.roundTripsByteIdentically = encoded.length === bytes.length && encoded.every((value, i) => value === bytes[i]);
    if (!report.roundTripsByteIdentically) report.diagnostics.push({ code: 'roundtrip-diff', severity: 'warning', title: 'File re-encodes differently', message: 'The file opens, but saving may rewrite its binary representation. Keep a copy of the original before editing.' });
    return report;
  } catch (error) {
    return {
      valid: false,
      fileVersion: null,
      roundTripsByteIdentically: null,
      counts: { artboards: 0, objects: 0, timelines: 0, stateMachines: 0, assets: 0 },
      diagnostics: [{ code: 'invalid-riv', severity: 'error', title: 'Could not read this Rive file', message: (error as Error).message, fix: 'Check that the file is a complete .riv export, then try importing it again.' }],
    };
  }
}
