'use client';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, RotateCcw } from 'lucide-react';
import { PlayerApi, PlayerInput, PlayerProperty, RivePlayer } from '@/components/RivePlayer';
import { importRiv, RiveDoc } from '@openrive/rive/document';
import { NumberField } from '@/components/editor/controls';

export default function PreviewPage({ params }: PageProps<'/preview/[id]'>) {
  const { id } = use(params);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [doc, setDoc] = useState<RiveDoc | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [artboard, setArtboard] = useState(0);
  const [sm, setSm] = useState(0);
  const [anim, setAnim] = useState(0);
  const [inputs, setInputs] = useState<PlayerInput[]>([]);
  const [props, setProps] = useState<PlayerProperty[]>([]);
  const [vmName, setVmName] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [bg, setBg] = useState<'dark' | 'light' | 'checker'>('dark');
  const api = useRef<PlayerApi | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [metaRes, rivRes] = await Promise.all([fetch(`/api/projects/${id}?meta=1`), fetch(`/api/projects/${id}/riv`)]);
        if (!rivRes.ok) throw new Error('This file has not been saved yet or does not exist.');
        const b = new Uint8Array(await rivRes.arrayBuffer());
        setName(metaRes.ok ? (await metaRes.json()).name : 'Preview');
        const d = importRiv(b);
        setDoc(d);
        // files without state machines look best with every timeline playing
        if (!d.artboards[0]?.stateMachines.length) setAnim(-1);
        setBytes(b);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id]);

  const ab = doc?.artboards[artboard];
  const smCount = ab?.stateMachines.length ?? 0;
  const bgClass = bg === 'dark' ? 'bg-[#101010]' : bg === 'light' ? 'bg-[#f4f4f4]' : 'checker';

  return (
    <div className="h-full flex flex-col">
      <header className="h-12 flex items-center gap-3 px-4 border-b border-line bg-bg1">
        <Link href={`/editor/${id}`} className="icon-btn" title="Back to editor">
          <ArrowLeft size={16} />
        </Link>
        <span className="font-semibold">{name}</span>
        <span className="text-t2">Preview</span>
        <div className="flex-1" />
        <select className="field w-44 h-7" value={artboard} onChange={(e) => (setArtboard(+e.target.value), setSm(0), setInputs([]), setProps([]))}>
          {doc?.artboards.map((a, i) => (
            <option key={a.id} value={i}>
              {String(a.artboard.props.name || `Artboard ${i + 1}`)}
            </option>
          ))}
        </select>
        <select className="field w-48 h-7" value={smCount ? sm : -1} onChange={(e) => (setSm(+e.target.value), setInputs([]))}>
          {ab?.stateMachines.map((m, i) => (
            <option key={m.id} value={i}>
              {String(m.props.name || `State Machine ${i + 1}`)}
            </option>
          ))}
          <option value={-1}>Timeline only</option>
        </select>
        {(sm === -1 || !smCount) && (
          <select className="field w-40 h-7" value={anim} onChange={(e) => setAnim(+e.target.value)}>
            <option value={-1}>All timelines</option>
            {ab?.animations.map((a, i) => (
              <option key={a.id} value={i}>
                {String(a.props.name || `Timeline ${i + 1}`)}
              </option>
            ))}
          </select>
        )}
        <select className="field w-28 h-7" value={bg} onChange={(e) => setBg(e.target.value as typeof bg)}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="checker">Transparent</option>
        </select>
        <button className="btn h-7" onClick={() => api.current?.restart()}>
          <RotateCcw size={13} /> Restart
        </button>
        <a className="btn btn-primary h-7" href={`/api/projects/${id}/riv`}>
          <Download size={13} /> .riv
        </a>
      </header>
      <div className="flex-1 flex min-h-0">
        <div className={`flex-1 relative ${bgClass}`}>
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center text-[#ffb4b4]">{error}</div>
          ) : (
            <RivePlayer
              bytes={bytes}
              artboardIndex={artboard}
              stateMachineIndex={smCount ? sm : -1}
              animationIndex={Math.max(0, anim)}
              mixAll={anim === -1}
              className="absolute inset-4"
              onInputs={setInputs}
              onProperties={(p, name) => {
                setProps(p);
                setVmName(name);
              }}
              onEvent={(n) => setEvents((ev) => [`${new Date().toLocaleTimeString()}  ${n}`, ...ev].slice(0, 30))}
              apiRef={api}
            />
          )}
        </div>
        {(inputs.length > 0 || events.length > 0 || props.length > 0) && (
          <aside className="w-72 border-l border-line bg-bg1 p-3 flex flex-col gap-2 overflow-auto">
            {props.length > 0 && (
              <>
                <div className="panel-title">View model{vmName ? ` · ${vmName}` : ''}</div>
                <p className="text-t3 text-[11px] -mt-1">Data-bound properties of the default instance.</p>
                {props.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 min-h-8">
                    <span className="flex-1 truncate" title={p.type}>
                      {p.name}
                    </span>
                    {(p.type === 'number' || p.type === 'integer') && (
                      <div className="w-24">
                        <NumberField value={Number(p.value ?? 0)} onChange={(v) => api.current?.setProperty(p.name, p.type, v)} />
                      </div>
                    )}
                    {p.type === 'boolean' && (
                      <input type="checkbox" checked={!!p.value} onChange={(e) => api.current?.setProperty(p.name, p.type, e.target.checked)} />
                    )}
                    {p.type === 'string' && (
                      <input className="field w-32" value={String(p.value ?? '')} onChange={(e) => api.current?.setProperty(p.name, p.type, e.target.value)} />
                    )}
                    {p.type === 'color' && (
                      <input
                        type="color"
                        value={`#${((Number(p.value ?? 0) >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`}
                        onChange={(e) => api.current?.setProperty(p.name, p.type, (0xff000000 | parseInt(e.target.value.slice(1), 16)) | 0)}
                      />
                    )}
                    {p.type === 'enumType' && (
                      <select className="field w-32" value={String(p.value ?? '')} onChange={(e) => api.current?.setProperty(p.name, p.type, e.target.value)}>
                        {p.options?.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    )}
                    {p.type === 'trigger' && (
                      <button className="btn h-6 px-2" onClick={() => api.current?.setProperty(p.name, p.type, true)}>
                        Fire
                      </button>
                    )}
                    {!['number', 'integer', 'boolean', 'string', 'color', 'enumType', 'trigger'].includes(p.type) && (
                      <span className="text-t3 text-[11px]">{p.type}</span>
                    )}
                  </div>
                ))}
              </>
            )}
            {inputs.length > 0 && <div className="panel-title mt-2">Inputs</div>}
            {inputs.map((i) => (
              <div key={i.name} className="flex items-center gap-2 h-8">
                <span className="flex-1 truncate">{i.name}</span>
                {i.type === 'number' && (
                  <div className="w-20">
                    <NumberField value={Number(i.value)} onChange={(v) => api.current?.setInput(i.name, v)} />
                  </div>
                )}
                {i.type === 'bool' && <input type="checkbox" checked={!!i.value} onChange={(e) => api.current?.setInput(i.name, e.target.checked)} />}
                {i.type === 'trigger' && (
                  <button className="btn h-6 px-2" onClick={() => api.current?.setInput(i.name, true)}>
                    Fire
                  </button>
                )}
              </div>
            ))}
            {events.length > 0 && (
              <>
                <div className="panel-title mt-3">Events</div>
                {events.map((e, k) => (
                  <div key={k} className="font-mono text-[11px] text-t1 selectable">
                    {e}
                  </div>
                ))}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
