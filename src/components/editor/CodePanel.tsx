'use client';
import { useMemo, useState } from 'react';
import { Braces, Check, Copy, Info, Play, Plus, Trash2, X } from 'lucide-react';
import * as openriveApi from '@/lib/rive/api';
import * as assetsApi from '@/lib/rive/assets';
import * as themeApi from '@/lib/rive/theme';
import { importSvg } from '@/lib/rive/svg';
import { deepClone, newId, RiveDoc } from '@/lib/rive/document';
import { findArtboard } from '@/lib/rive/ops';
import { isA } from '@/lib/rive/schema';
import { ensureEditorMeta } from '@/lib/rive/theme';
import { useEditor } from '@/lib/store/editor';

// ---------------------------------------------------------------------------
// Scripts: JavaScript that edits the document through the OpenRive API (the same
// API the CLI and MCP server use). A run is applied as one undoable change.

const EXAMPLES: { name: string; code: string }[] = [
  {
    name: 'Grid of dots',
    code: `// Adds a 6×6 grid of circles to the active artboard.
const size = 30, gap = 50;
for (let row = 0; row < 6; row++) {
  for (let col = 0; col < 6; col++) {
    api.addShape(doc, {
      artboard, kind: 'ellipse', name: \`Dot \${row}-\${col}\`,
      x: 60 + col * gap, y: 60 + row * gap, width: size, height: size,
      fill: \`hsl(\${(row * 6 + col) * 10}, 80%, 60%)\`,
    });
  }
}
log('added 36 dots');`,
  },
  {
    name: 'Pulse every shape',
    code: `// Creates a "Pulse" timeline that scales every top-level shape up and down.
const anim = api.addAnimation(doc, { artboard, name: 'Pulse', duration: 1.2, loop: 'pingPong' });
const tree = api.outline(doc).artboards.find((a) => a.id === artboard);
let n = 0;
for (const o of tree.children) {
  if (o.type !== 'Shape') continue;
  for (const property of ['scaleX', 'scaleY'])
    api.addKeyframes(doc, { artboard, animation: anim.id, object: o.id, property,
      keys: [{ time: 0, value: 1, ease: 'easeInOut' }, { time: 1.2, value: 1.2 }] });
  n++;
}
log(\`keyed \${n} shapes\`);`,
  },
  {
    name: 'Theme color from fills',
    code: `// Turns every distinct fill color on the artboard into a theme color and binds it.
const tree = api.outline(doc).artboards.find((a) => a.id === artboard);
const seen = new Map();
const walk = (list) => list.forEach((o) => {
  if (o.fill && o.type !== 'Text') {
    if (!seen.has(o.fill)) { seen.set(o.fill, \`Color \${seen.size + 1}\`); api.defineColor(doc, seen.get(o.fill), o.fill); }
    api.applyThemeColor(doc, o.id, seen.get(o.fill));
  }
  if (o.children) walk(o.children);
});
walk(tree.children);
log(\`\${seen.size} theme colors\`);`,
  },
  {
    name: 'Inspect the file',
    code: `// Prints the artboard tree (read-only).
log(api.outline(doc));`,
  },
];

function runScript(code: string, doc: RiveDoc, artboard: string, log: (...a: unknown[]) => void): RiveDoc {
  const draft = deepClone(doc);
  const api = { ...openriveApi, ...assetsApi, ...themeApi, importSvg };
  const fn = new Function('doc', 'api', 'artboard', 'log', `"use strict";\n${code}`);
  const result = fn(draft, api, artboard, log);
  if (result && typeof (result as Promise<unknown>).then === 'function') throw new Error('Scripts run synchronously; async code is not supported.');
  return draft;
}

function ScriptsTab() {
  const doc = useEditor((s) => s.doc);
  const readOnly = useEditor((s) => s.readOnly);
  const activeArtboardId = useEditor((s) => s.activeArtboardId);
  const scripts = doc?.editor?.scripts ?? [];
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = scripts.find((x) => x.id === currentId) ?? scripts[0];
  const [output, setOutput] = useState<{ text: string; error?: boolean }[]>([]);
  const s = useEditor.getState();

  const addScript = (name: string, code: string) => {
    const id = newId();
    s.commit((d) => {
      const meta = ensureEditorMeta(d);
      (meta.scripts ??= []).push({ id, name, code });
    });
    setCurrentId(id);
  };

  const update = (patch: { name?: string; code?: string }) =>
    current &&
    s.commit((d) => {
      const sc = d.editor?.scripts?.find((x) => x.id === current.id);
      if (sc) Object.assign(sc, patch);
    }, true);

  const run = () => {
    const st = useEditor.getState();
    if (!st.doc || !current) return;
    const ab = findArtboard(st.doc, st.activeArtboardId) ?? st.doc.artboards[0];
    const lines: { text: string; error?: boolean }[] = [];
    const log = (...a: unknown[]) => lines.push({ text: a.map((v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))).join(' ') });
    const t0 = performance.now();
    try {
      const next = runScript(current.code, st.doc, ab?.id ?? '', log);
      st.commit((d) => {
        d.top = next.top;
        d.artboards = next.artboards;
        d.editor = next.editor;
      });
      lines.push({ text: `✓ ran in ${Math.round(performance.now() - t0)} ms (Ctrl+Z to undo)` });
    } catch (e) {
      lines.push({ text: `✗ ${(e as Error).message}`, error: true });
    }
    setOutput(lines);
  };

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-44 border-r border-line flex flex-col">
        <div className="flex-1 overflow-auto py-1">
          {scripts.map((sc) => (
            <div
              key={sc.id}
              className={`px-2 h-7 flex items-center gap-1 cursor-pointer group ${sc.id === current?.id ? 'bg-bg3 text-t0' : 'text-t1 hover:bg-bg2'}`}
              onClick={() => setCurrentId(sc.id)}
            >
              <span className="flex-1 truncate">{sc.name}</span>
              {!readOnly && (
                <button
                  className="opacity-0 group-hover:opacity-100 text-t2 hover:text-t0"
                  title="Delete script"
                  onClick={(e) => {
                    e.stopPropagation();
                    s.commit((d) => {
                      if (d.editor?.scripts) d.editor.scripts = d.editor.scripts.filter((x) => x.id !== sc.id);
                    });
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {!scripts.length && <div className="px-2 py-2 text-t3 text-[11px]">No scripts yet. Start from an example:</div>}
        </div>
        <div className="border-t border-line p-1.5 flex flex-col gap-1">
          <select
            className="field h-7"
            value=""
            disabled={readOnly}
            onChange={(e) => {
              const ex = EXAMPLES[+e.target.value];
              if (ex) addScript(ex.name, ex.code);
            }}
          >
            <option value="">+ From example…</option>
            {EXAMPLES.map((ex, i) => (
              <option key={ex.name} value={i}>
                {ex.name}
              </option>
            ))}
          </select>
          <button className="btn h-7 justify-center" disabled={readOnly} onClick={() => addScript(`Script ${scripts.length + 1}`, '// doc, api, artboard and log are available\n')}>
            <Plus size={12} /> New script
          </button>
        </div>
      </div>
      {current ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-8 flex items-center gap-2 px-2 border-b border-line">
            <input className="field h-6 w-48" value={current.name} disabled={readOnly} onChange={(e) => update({ name: e.target.value })} />
            <span className="text-t3 text-[11px] truncate flex-1">
              Globals: <code>doc</code>, <code>api</code> (OpenRive API: addShape, addText, addAnimation, addKeyframes, addStateMachine, setProperties, outline…),{' '}
              <code>artboard</code> (active artboard id), <code>log()</code>
            </span>
            <button className="btn btn-primary h-6" disabled={readOnly || !activeArtboardId} onClick={run} title="Run (Ctrl+Enter)">
              <Play size={12} /> Run
            </button>
          </div>
          <div className="flex-1 flex min-h-0">
            <textarea
              className="flex-1 bg-bg0 text-t0 font-mono text-[12px] leading-[1.5] p-2 outline-none resize-none"
              spellCheck={false}
              value={current.code}
              disabled={readOnly}
              onChange={(e) => update({ code: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  run();
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const t = e.currentTarget;
                  const { selectionStart: a, selectionEnd: b } = t;
                  update({ code: t.value.slice(0, a) + '  ' + t.value.slice(b) });
                  requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
                }
              }}
            />
            <div className="w-72 border-l border-line overflow-auto p-2 font-mono text-[11px] whitespace-pre-wrap">
              <div className="label mb-1 font-sans">Console</div>
              {output.map((l, i) => (
                <div key={i} className={l.error ? 'text-[#ff9b9b]' : 'text-t1'}>
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-t3">Create a script to automate edits with the OpenRive API.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Embed: integration code for the runtimes, filled in with this file's names.

function useEmbedInfo() {
  const doc = useEditor((s) => s.doc);
  const projectName = useEditor((s) => s.projectName);
  const activeArtboardId = useEditor((s) => s.activeArtboardId);
  return useMemo(() => {
    const ab = (doc && (findArtboard(doc, activeArtboardId) ?? doc.artboards[0])) || null;
    const sm = ab?.stateMachines[0];
    const inputs = (sm?.children ?? [])
      .filter((c) => isA(c.type, 'StateMachineInput'))
      .map((c) => ({ name: String(c.props.name ?? ''), type: c.type === 'StateMachineBool' ? 'bool' : c.type === 'StateMachineTrigger' ? 'trigger' : 'number' }));
    const file = `${(projectName || 'animation').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'animation'}.riv`;
    return {
      file,
      artboard: String(ab?.artboard.props.name ?? 'Artboard'),
      stateMachine: sm ? String(sm.props.name ?? 'State Machine 1') : null,
      animation: ab?.animations[0] ? String(ab.animations[0].props.name ?? 'Timeline 1') : null,
      inputs,
    };
  }, [doc, projectName, activeArtboardId]);
}

type Info = ReturnType<typeof useEmbedInfo>;

const SNIPPETS: Record<string, { label: string; lang: string; code: (i: Info) => string }> = {
  web: {
    label: 'Web (JS)',
    lang: 'js',
    code: (i) => `// npm i @rive-app/canvas
import { Rive, Layout, Fit } from '@rive-app/canvas';

const rive = new Rive({
  src: '/${i.file}',
  canvas: document.getElementById('canvas'),
  artboard: '${i.artboard}',
  ${i.stateMachine ? `stateMachines: '${i.stateMachine}',` : `animations: '${i.animation ?? ''}',`}
  autoplay: true,
  autoBind: true, // binds the default view model instance, if any
  layout: new Layout({ fit: Fit.Contain }),
  onLoad: () => rive.resizeDrawingSurfaceToCanvas(),
});
${
  i.stateMachine && i.inputs.length
    ? `
const inputs = rive.stateMachineInputs('${i.stateMachine}');
${i.inputs
  .map((x) =>
    x.type === 'trigger'
      ? `inputs.find((n) => n.name === '${x.name}').fire();`
      : `inputs.find((n) => n.name === '${x.name}').value = ${x.type === 'bool' ? 'true' : '1'};`,
  )
  .join('\n')}`
    : ''
}`,
  },
  react: {
    label: 'React',
    lang: 'tsx',
    code: (i) => `// npm i @rive-app/react-canvas
import { useRive${i.inputs.length ? ', useStateMachineInput' : ''} } from '@rive-app/react-canvas';

export function ${i.artboard.replace(/[^A-Za-z0-9]/g, '') || 'Animation'}() {
  const { rive, RiveComponent } = useRive({
    src: '/${i.file}',
    artboard: '${i.artboard}',
    ${i.stateMachine ? `stateMachines: '${i.stateMachine}',` : `animations: '${i.animation ?? ''}',`}
    autoplay: true,
  });
${i.inputs
  .map((x) => `  const ${x.name.replace(/[^A-Za-z0-9]/g, '') || 'input'} = useStateMachineInput(rive, '${i.stateMachine}', '${x.name}');`)
  .join('\n')}
  return <RiveComponent style={{ width: 400, height: 400 }} />;
}`,
  },
  flutter: {
    label: 'Flutter',
    lang: 'dart',
    code: (i) => `// pubspec.yaml: rive: ^0.13.0   (put ${i.file} in assets/)
import 'package:rive/rive.dart';

class MyAnimation extends StatefulWidget {
  const MyAnimation({super.key});
  @override
  State<MyAnimation> createState() => _MyAnimationState();
}

class _MyAnimationState extends State<MyAnimation> {
${i.inputs.map((x) => `  ${x.type === 'bool' ? 'SMIBool' : x.type === 'trigger' ? 'SMITrigger' : 'SMINumber'}? ${x.name.replace(/[^A-Za-z0-9]/g, '')};`).join('\n')}

  void _onInit(Artboard artboard) {
${
  i.stateMachine
    ? `    final controller = StateMachineController.fromArtboard(artboard, '${i.stateMachine}')!;
    artboard.addController(controller);
${i.inputs
  .map((x) => `    ${x.name.replace(/[^A-Za-z0-9]/g, '')} = controller.${x.type === 'bool' ? 'getBoolInput' : x.type === 'trigger' ? 'getTriggerInput' : 'getNumberInput'}('${x.name}');`)
  .join('\n')}`
    : `    artboard.addController(SimpleAnimation('${i.animation ?? ''}'));`
}
  }

  @override
  Widget build(BuildContext context) => RiveAnimation.asset(
        'assets/${i.file}',
        artboard: '${i.artboard}',
        onInit: _onInit,
      );
}`,
  },
  ios: {
    label: 'iOS (SwiftUI)',
    lang: 'swift',
    code: (i) => `// Swift Package: https://github.com/rive-app/rive-ios  (add ${i.file} to the bundle)
import RiveRuntime
import SwiftUI

struct AnimationView: View {
  @StateObject private var vm = RiveViewModel(
    fileName: "${i.file.replace(/\.riv$/, '')}",
    ${i.stateMachine ? `stateMachineName: "${i.stateMachine}",` : `animationName: "${i.animation ?? ''}",`}
    artboardName: "${i.artboard}"
  )

  var body: some View {
    vm.view()
${i.inputs.length ? `      .onTapGesture {\n${i.inputs.map((x) => (x.type === 'trigger' ? `        vm.triggerInput("${x.name}")` : `        vm.setInput("${x.name}", value: ${x.type === 'bool' ? 'true' : '1.0'})`)).join('\n')}\n      }` : ''}
  }
}`,
  },
  android: {
    label: 'Android',
    lang: 'xml',
    code: (i) => `<!-- implementation("app.rive:rive-android:+")  — put ${i.file} in res/raw/ -->
<app.rive.runtime.kotlin.RiveAnimationView
    android:id="@+id/rive"
    android:layout_width="match_parent"
    android:layout_height="300dp"
    app:riveResource="@raw/${i.file.replace(/\.riv$/, '')}"
    app:riveArtboard="${i.artboard}"
    ${i.stateMachine ? `app:riveStateMachine="${i.stateMachine}"` : `app:riveAnimation="${i.animation ?? ''}"`}
    app:riveAutoPlay="true" />
${
  i.inputs.length
    ? `
<!-- Kotlin -->
<!--
val rive = findViewById<RiveAnimationView>(R.id.rive)
${i.inputs.map((x) => (x.type === 'trigger' ? `rive.fireState("${i.stateMachine}", "${x.name}")` : `rive.setNumberState / setBooleanState("${i.stateMachine}", "${x.name}", ...)`)).join('\n')}
-->`
    : ''
}`,
  },
};

function EmbedTab() {
  const info = useEmbedInfo();
  const [target, setTarget] = useState<keyof typeof SNIPPETS>('web');
  const [copied, setCopied] = useState(false);
  const code = SNIPPETS[target].code(info).replace(/\n{3,}/g, '\n\n');
  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-44 border-r border-line py-1">
        {Object.entries(SNIPPETS).map(([k, v]) => (
          <div
            key={k}
            className={`px-2 h-7 flex items-center cursor-pointer ${k === target ? 'bg-bg3 text-t0' : 'text-t1 hover:bg-bg2'}`}
            onClick={() => setTarget(k as keyof typeof SNIPPETS)}
          >
            {v.label}
          </div>
        ))}
        <div className="px-2 pt-3 text-t3 text-[11px] leading-snug">
          Uses artboard <b className="text-t1">{info.artboard}</b>
          {info.stateMachine ? (
            <>
              , state machine <b className="text-t1">{info.stateMachine}</b> and {info.inputs.length} input(s).
            </>
          ) : (
            '. Add a state machine to get input code.'
          )}
        </div>
      </div>
      <div className="flex-1 relative min-w-0">
        <button
          className="btn h-6 absolute right-3 top-2"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <pre className="h-full overflow-auto bg-bg0 p-3 font-mono text-[12px] leading-[1.5] text-t0">{code}</pre>
      </div>
    </div>
  );
}

function AboutRiveScripting() {
  const doc = useEditor((s) => s.doc);
  const scriptAssets = (doc?.top ?? []).filter((o) => o.type === 'ScriptAsset').length;
  return (
    <div className="flex-1 overflow-auto p-4 max-w-3xl text-t1 leading-relaxed text-[12px] flex flex-col gap-2">
      <p>
        <b className="text-t0">Rive Scripting</b> (the Code section in the rive.app editor) lets you write Luau scripts that run inside the Rive runtime: custom drawing,
        layouts, path effects and logic that talks to state machines and view models.
      </p>
      <p>
        The rive.app editor compiles those scripts to bytecode and <b className="text-t0">signs</b> them with Rive&apos;s private key. The official runtimes check the
        signature and skip scripts that aren&apos;t signed by Rive. A third-party editor like OpenRive can&apos;t produce runnable Rive scripts, so it offers two
        alternatives:
      </p>
      <ul className="list-disc pl-5">
        <li>
          <b className="text-t0">Scripts</b>: JavaScript that builds and edits the file at design time with the same API as the CLI and MCP server. The output is a normal
          .riv that works in every runtime.
        </li>
        <li>
          <b className="text-t0">Embed</b>: ready-to-paste runtime code to drive your state machine inputs and view models from your app.
        </li>
      </ul>
      <p>
        Script assets in files made with rive.app are kept when you open and save them in OpenRive.
        {scriptAssets ? ` This file contains ${scriptAssets} script asset(s).` : ''}
      </p>
    </div>
  );
}

export function CodePanel() {
  const [tab, setTab] = useState<'scripts' | 'embed' | 'about'>('scripts');
  return (
    <div className="h-[300px] shrink-0 border-t border-line bg-bg1 flex flex-col">
      <div className="h-8 flex items-center gap-1 px-2 border-b border-line">
        <Braces size={13} className="text-t2" />
        <span className="panel-title mr-2">Code</span>
        {(
          [
            ['scripts', 'Scripts'],
            ['embed', 'Embed'],
            ['about', 'Rive scripting'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`px-2 h-6 rounded text-[11px] font-semibold ${tab === id ? 'bg-bg3 text-t0' : 'text-t2 hover:text-t1'}`} onClick={() => setTab(id)}>
            {id === 'about' && <Info size={11} className="inline mr-1 -mt-0.5" />}
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button className="icon-btn" title="Close (Alt+C)" onClick={() => useEditor.getState().set('codeOpen', false)}>
          <X size={13} />
        </button>
      </div>
      {tab === 'scripts' ? <ScriptsTab /> : tab === 'embed' ? <EmbedTab /> : <AboutRiveScripting />}
    </div>
  );
}
