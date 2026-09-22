'use client';
// Plays a .riv file with the official runtime: the first (or chosen) artboard,
// running its state machine (with pointer input) or first timeline.
import { useEffect, useRef, useState } from 'react';
import type { Artboard, File as RiveFile, LinearAnimationInstance, StateMachineInstance, ViewModelInstance } from '@rive-app/canvas-advanced';
import { loadRuntime } from '@/lib/rive/runtime';

export interface PlayerInput {
  name: string;
  type: 'number' | 'bool' | 'trigger';
  value: number | boolean;
}

export interface PlayerApi {
  setInput(name: string, value: number | boolean): void;
  /** set a view model property (data binding); triggers fire regardless of value */
  setProperty(name: string, type: string, value: number | boolean | string): void;
  restart(): void;
}

export interface PlayerProperty {
  name: string;
  type: string;
  value: number | boolean | string | null;
  options?: string[];
}

export function RivePlayer({
  bytes,
  artboardIndex = 0,
  stateMachineIndex = 0,
  animationIndex = -1,
  className = '',
  paused = false,
  artboardName,
  mixAll = false,
  onInputs,
  onProperties,
  onEvent,
  apiRef,
}: {
  bytes: Uint8Array | null;
  artboardIndex?: number;
  /** -1 = don't run a state machine */
  stateMachineIndex?: number;
  /** used when no state machine runs; -1 = first timeline */
  animationIndex?: number;
  className?: string;
  paused?: boolean;
  /** pick the artboard by name instead of index */
  artboardName?: string;
  /** without a state machine, play every timeline at once */
  mixAll?: boolean;
  onInputs?: (inputs: PlayerInput[]) => void;
  /** view model (data binding) properties of the bound default instance */
  onProperties?: (props: PlayerProperty[], viewModel: string | null) => void;
  onEvent?: (name: string) => void;
  apiRef?: React.MutableRefObject<PlayerApi | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const [error, setError] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!bytes) return;
    const canvas = canvasRef.current!;
    let disposed = false;
    let raf = 0;
    let file: RiveFile | null = null;
    let artboard: Artboard | null = null;
    let sm: StateMachineInstance | null = null;
    let anim: LinearAnimationInstance | null = null;
    let extra: LinearAnimationInstance[] = [];
    let vmi: ViewModelInstance | null = null;
    let cleanup = () => {};

    (async () => {
      try {
        const rive = await loadRuntime();
        if (disposed) return;
        const renderer = rive.makeRenderer(canvas);
        file = await rive.load(bytes, undefined, false);
        if (disposed) return;
        artboard = artboardName ? file.artboardByName(artboardName) : null;
        if (!artboard) artboard = file.artboardByIndex(Math.min(artboardIndex, file.artboardCount() - 1));
        if (stateMachineIndex >= 0 && artboard.stateMachineCount() > stateMachineIndex) {
          sm = new rive.StateMachineInstance(artboard.stateMachineByIndex(stateMachineIndex), artboard);
        } else if (artboard.animationCount() > 0) {
          anim = new rive.LinearAnimationInstance(artboard.animationByIndex(Math.max(0, animationIndex)), artboard);
          if (mixAll) {
            for (let i = 0; i < artboard.animationCount(); i++) {
              if (i !== Math.max(0, animationIndex)) extra.push(new rive.LinearAnimationInstance(artboard.animationByIndex(i), artboard));
            }
          }
        }
        // Files that use data binding need their default view model instance
        // bound, otherwise bound properties (and anything driven by them) stay static.
        let vmName: string | null = null;
        try {
          const vm = file.viewModelCount() > 0 ? file.defaultArtboardViewModel(artboard) : null;
          if (vm) {
            vmName = vm.name;
            vmi = vm.defaultInstance() ?? vm.instance();
            if (vmi) {
              if (sm) sm.bindViewModelInstance(vmi);
              else artboard.bindViewModelInstance(vmi);
            }
          }
        } catch {
          vmi = null;
        }
        const readProperties = () => {
          if (!vmi || !onProperties) return;
          const out: PlayerProperty[] = [];
          for (const p of vmi.getProperties()) {
            const t = String(p.type);
            let value: PlayerProperty['value'] = null;
            let options: string[] | undefined;
            try {
              if (t === 'number' || t === 'integer') value = vmi.number(p.name).value;
              else if (t === 'boolean') value = vmi.boolean(p.name).value;
              else if (t === 'string') value = vmi.string(p.name).value;
              else if (t === 'color') value = vmi.color(p.name).value;
              else if (t === 'enumType') {
                const e = vmi.enum(p.name);
                value = e.value;
                options = e.values;
              }
            } catch {
              value = null;
            }
            out.push({ name: p.name, type: t, value, options });
          }
          onProperties(out, vmName);
        };
        readProperties();
        setError(null);

        const readInputs = () => {
          if (!sm || !onInputs) return;
          const out: PlayerInput[] = [];
          for (let i = 0; i < sm.inputCount(); i++) {
            const input = sm.input(i);
            const type = input.type === rive.SMIInput.bool ? 'bool' : input.type === rive.SMIInput.number ? 'number' : 'trigger';
            out.push({ name: input.name, type, value: type === 'trigger' ? false : (input.value as number | boolean) });
          }
          onInputs(out);
        };
        readInputs();

        if (apiRef) {
          apiRef.current = {
            setInput(name, value) {
              if (!sm) return;
              for (let i = 0; i < sm.inputCount(); i++) {
                const input = sm.input(i);
                if (input.name !== name) continue;
                if (input.type === rive.SMIInput.trigger) input.asTrigger().fire();
                else if (input.type === rive.SMIInput.bool) input.asBool().value = !!value;
                else input.asNumber().value = Number(value);
              }
              readInputs();
            },
            setProperty(name, type, value) {
              if (!vmi) return;
              try {
                if (type === 'number' || type === 'integer') vmi.number(name).value = Number(value);
                else if (type === 'boolean') vmi.boolean(name).value = !!value;
                else if (type === 'string') vmi.string(name).value = String(value);
                else if (type === 'color') vmi.color(name).value = Number(value) | 0;
                else if (type === 'enumType') vmi.enum(name).value = String(value);
                else if (type === 'trigger') vmi.trigger(name).trigger();
              } catch {
                /* unsupported property */
              }
              readProperties();
            },
            restart: () => setRestartKey((k) => k + 1),
          };
        }

        // layout: contain + center
        const layout = () => {
          const dpr = window.devicePixelRatio || 1;
          const w = canvas.clientWidth * dpr;
          const h = canvas.clientHeight * dpr;
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          const b = artboard!.bounds;
          const aw = b.maxX - b.minX;
          const ah = b.maxY - b.minY;
          const scale = Math.min(w / aw, h / ah);
          return { scale, ox: (w - aw * scale) / 2, oy: (h - ah * scale) / 2, dpr };
        };
        const toArtboard = (e: PointerEvent) => {
          const r = canvas.getBoundingClientRect();
          const { scale, ox, oy, dpr } = layout();
          return [((e.clientX - r.left) * dpr - ox) / scale, ((e.clientY - r.top) * dpr - oy) / scale] as const;
        };
        const down = (e: PointerEvent) => sm?.pointerDown(...toArtboard(e), 0);
        const move = (e: PointerEvent) => sm?.pointerMove(...toArtboard(e), 0);
        const up = (e: PointerEvent) => sm?.pointerUp(...toArtboard(e), 0);
        const leave = (e: PointerEvent) => sm?.pointerExit(...toArtboard(e), 0);
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointerleave', leave);
        cleanup = () => {
          canvas.removeEventListener('pointerdown', down);
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
          canvas.removeEventListener('pointerleave', leave);
          (renderer as { delete?: () => void }).delete?.();
        };

        let last = 0;
        let poll = 0;
        const frame = (t: number) => {
          if (disposed) return;
          const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
          last = t;
          const step = pausedRef.current ? 0 : dt;
          if (sm) {
            sm.advanceAndApply(step);
            const n = sm.reportedEventCount();
            for (let i = 0; i < n; i++) {
              const ev = sm.reportedEventAt(i);
              if (ev) onEvent?.(ev.name);
            }
            if (++poll % 10 === 0) {
              readInputs();
              readProperties();
            }
          } else if (anim) {
            for (const a of [anim, ...extra]) {
              a.advance(step);
              a.apply(1);
            }
            artboard!.advance(step);
          } else {
            artboard!.advance(step);
          }
          const { scale, ox, oy } = layout();
          renderer.clear();
          renderer.save();
          (renderer as unknown as { transform: (...m: number[]) => void }).transform(scale, 0, 0, scale, ox, oy);
          artboard!.draw(renderer);
          renderer.restore();
          raf = rive.requestAnimationFrame(frame);
        };
        raf = rive.requestAnimationFrame(frame);
        cleanup = ((prev) => () => {
          prev();
          rive.cancelAnimationFrame(raf);
        })(cleanup);
      } catch (e) {
        setError((e as Error)?.message ?? String(e));
      }
    })();

    return () => {
      disposed = true;
      cleanup();
      sm?.delete();
      anim?.delete();
      extra.forEach((a) => a.delete());
      extra = [];
      vmi?.unref?.();
      artboard?.delete();
      file?.unref?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, artboardIndex, artboardName, mixAll, stateMachineIndex, animationIndex, restartKey]);

  return (
    <div className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative'} ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {error && <div className="absolute inset-0 flex items-center justify-center text-[#ffb4b4] text-[11px] p-2 text-center">{error}</div>}
    </div>
  );
}
