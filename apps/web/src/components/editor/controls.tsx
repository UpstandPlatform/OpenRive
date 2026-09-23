'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colorAlpha, colorCss, colorToHex, hexToColor } from '@openrive/rive/ops';
import { useEditor } from '@/lib/store/editor';
import { addSwatch } from '@openrive/rive/theme';
import { Link2, Unlink } from 'lucide-react';

type KeyState = 'none' | 'animated' | 'keyed';

/** Number input that can be scrubbed by dragging its label. */
export function NumberField({
  value,
  onChange,
  label,
  step = 1,
  precision = 2,
  min,
  max,
  suffix,
  keyState = 'none',
  disabled,
  scale = 1,
  className = '',
}: {
  value: number;
  onChange: (v: number, transient: boolean) => void;
  label?: string;
  step?: number;
  precision?: number;
  min?: number;
  max?: number;
  suffix?: string;
  keyState?: KeyState;
  disabled?: boolean;
  /** display multiplier, e.g. 100 for percentages or 180/PI for degrees */
  scale?: number;
  className?: string;
}) {
  const shown = round(value * scale, precision);
  const [text, setText] = useState(String(shown));
  const [focused, setFocused] = useState(false);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = () => {
    const expr = text.trim();
    let v = Number(expr);
    if (Number.isNaN(v)) {
      // allow simple arithmetic like "100/2" or "+10"
      try {
        if (/^[-+*/().\d\s]+$/.test(expr)) v = Function(`"use strict";return (${expr.startsWith('+') ? shown + expr : expr})`)();
      } catch {
        v = NaN;
      }
    }
    if (!Number.isNaN(v) && isFinite(v)) onChange(clamp(v / scale), false);
    else setText(String(shown));
  };
  const scrub = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    const startX = e.clientX;
    const start = value * scale;
    const st = useEditor.getState();
    st.beginGesture();
    const move = (ev: PointerEvent) => {
      const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      onChange(clamp(round(start + (ev.clientX - startX) * step * mult, precision) / scale), true);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useEditor.getState().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={`relative flex items-center min-w-0 ${className}`}>
      {label && (
        <span
          className="scrub absolute left-1.5 text-t2 text-[11px] z-[1] w-3.5 text-center"
          onPointerDown={scrub}
          title="Drag to scrub (Shift ×10, Alt ×0.1)"
        >
          {label}
        </span>
      )}
      <input
        className={`field ${label ? 'pl-5' : ''} ${keyState === 'keyed' ? 'keyed' : keyState === 'animated' ? 'animated' : ''}`}
        value={focused ? text : `${shown}${suffix ?? ''}`}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true);
          setText(String(shown));
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(String(shown));
            setFocused(false);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) * step;
            const v = clamp(round(value * scale + d, precision) / scale);
            onChange(v, false);
            setText(String(round(v * scale, precision)));
          }
          e.stopPropagation();
        }}
      />
    </div>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value);
  }
  return (
    <input
      className={`field ${className}`}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onChange(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(value);
        e.stopPropagation();
      }}
    />
  );
}

function round(v: number, p: number) {
  const k = 10 ** p;
  return Math.round(v * k) / k;
}

// ---------------------------------------------------------------------------
// Color

function hsvToRgb(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function ColorPicker({
  value,
  onChange,
  hideSwatches,
  boundSwatch,
}: {
  value: number;
  /** swatchId is set when a theme color was picked (null = plain color) */
  onChange: (v: number, transient: boolean, swatchId?: string | null) => void;
  hideSwatches?: boolean;
  boundSwatch?: string;
}) {
  const doc = useEditor((st) => st.doc);
  const themeColors = hideSwatches || !doc?.editor ? [] : doc.editor.swatches;
  const theme = doc?.editor?.themes.find((t) => t.id === doc.editor!.activeThemeId);
  const r = (value >>> 16) & 255;
  const g = (value >>> 8) & 255;
  const b = value & 255;
  const a = colorAlpha(value);
  const [hsv, setHsv] = useState(() => rgbToHsv(r, g, b));
  const lastValue = useRef(value);
  useEffect(() => {
    if (value !== lastValue.current) {
      setHsv(rgbToHsv((value >>> 16) & 255, (value >>> 8) & 255, value & 255));
      lastValue.current = value;
    }
  }, [value]);
  const emit = (h: number, s: number, v: number, alpha: number, transient: boolean) => {
    const [rr, gg, bb] = hsvToRgb(h, s, v);
    const c = ((Math.round(alpha * 255) << 24) | (rr << 16) | (gg << 8) | bb) >>> 0;
    lastValue.current = c;
    setHsv([h, s, v]);
    onChange(c, transient, null);
  };
  const dragArea = (e: React.PointerEvent, fn: (fx: number, fy: number) => void) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const st = useEditor.getState();
    st.beginGesture();
    const at = (ev: { clientX: number; clientY: number }) =>
      fn(
        Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
        Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
      );
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useEditor.getState().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const [h, s, v] = hsv;
  const [hr, hg, hb] = hsvToRgb(h, 1, 1);
  return (
    <div className="w-[220px] p-2 flex flex-col gap-2">
      <div
        className="relative h-36 rounded cursor-crosshair"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, rgb(${hr},${hg},${hb}))`,
        }}
        onPointerDown={(e) => dragArea(e, (fx, fy) => emit(h, fx, 1 - fy, a, true))}
      >
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
        />
      </div>
      <div
        className="relative h-3 rounded cursor-pointer"
        style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
        onPointerDown={(e) => dragArea(e, (fx) => emit(fx * 359.9, s, v, a, true))}
      >
        <div className="absolute top-0 w-1.5 h-3 bg-white rounded -translate-x-1/2 pointer-events-none" style={{ left: `${(h / 360) * 100}%` }} />
      </div>
      <div className="relative h-3 rounded cursor-pointer checker" onPointerDown={(e) => dragArea(e, (fx) => emit(h, s, v, fx, true))}>
        <div className="absolute inset-0 rounded" style={{ background: `linear-gradient(to right, transparent, rgb(${r},${g},${b}))` }} />
        <div className="absolute top-0 w-1.5 h-3 bg-white rounded -translate-x-1/2 pointer-events-none" style={{ left: `${a * 100}%` }} />
      </div>
      <div className="flex gap-1.5">
        <TextField
          value={colorToHex(value).slice(1).toUpperCase()}
          onChange={(t) => {
            const c = hexToColor(t, a);
            lastValue.current = c;
            setHsv(rgbToHsv((c >>> 16) & 255, (c >>> 8) & 255, c & 255));
            onChange(c, false);
          }}
          className="font-mono"
        />
        <NumberField
          className="w-16 shrink-0"
          value={a}
          scale={100}
          precision={0}
          min={0}
          max={1}
          suffix="%"
          onChange={(na, t) => emit(h, s, v, na, t)}
        />
      </div>
      {!hideSwatches && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center">
            <span className="label flex-1">Theme colors</span>
            <button
              className="text-accent text-[11px]"
              onClick={() => {
                const name = prompt('Theme color name', `Color ${themeColors.length + 1}`);
                if (!name) return;
                let id = '';
                useEditor.getState().commit((d) => {
                  id = addSwatch(d, name, value).id;
                });
                onChange(value, false, id);
              }}
              title="Save this color as a theme color and link it"
            >
              + Save
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {themeColors.map((sw) => {
              const c = theme?.colors[sw.id] ?? 0xff000000;
              return (
                <button
                  key={sw.id}
                  title={sw.name}
                  className={`w-5 h-5 rounded checker overflow-hidden ${boundSwatch === sw.id ? 'outline outline-2 outline-white outline-offset-1' : ''}`}
                  onClick={() => {
                    lastValue.current = c;
                    setHsv(rgbToHsv((c >>> 16) & 255, (c >>> 8) & 255, c & 255));
                    onChange(c, false, sw.id);
                  }}
                >
                  <span className="block w-full h-full" style={{ background: colorCss(c) }} />
                </button>
              );
            })}
            {!themeColors.length && <span className="text-t3 text-[11px]">None yet</span>}
          </div>
          <div className="label mt-1">Presets</div>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {[0xffffffff, 0xff000000, 0xffc4c4c4, 0xff57a5e0, 0xfff25ca2, 0xffffcf33, 0xff27c498, 0xffff5c5c, 0xffb45cff, 0x00000000].map(
          (c) => (
            <button
              key={c}
              className="w-5 h-5 rounded checker overflow-hidden"
              onClick={() => {
                lastValue.current = c;
                setHsv(rgbToHsv((c >>> 16) & 255, (c >>> 8) & 255, c & 255));
                onChange(c, false);
              }}
            >
              <span className="block w-full h-full" style={{ background: colorCss(c) }} />
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export function ColorSwatch({
  value,
  onChange,
  keyState = 'none',
  boundSwatch,
}: {
  value: number;
  onChange: (v: number, transient: boolean, swatchId?: string | null) => void;
  keyState?: KeyState;
  boundSwatch?: string;
}) {
  const boundName = useEditor((st) => (boundSwatch ? st.doc?.editor?.swatches.find((x) => x.id === boundSwatch)?.name : undefined));
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(null);
    };
    const onScroll = (e: Event) => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);
  // Position the picker in a portal so panels with overflow (or the canvas) never clip it.
  const toggle = (e: React.MouseEvent) => {
    if (open) return setOpen(null);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const W = 240;
    const H = 420;
    let left = r.right - W;
    if (left < 8) left = 8;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    let top = r.bottom + 6;
    if (top + H > window.innerHeight - 8) top = Math.max(8, r.top - H - 6);
    setOpen({ left, top });
  };
  return (
    <div className="relative flex items-center gap-2 flex-1 min-w-0" ref={ref}>
      <button className="w-6 h-6 rounded checker overflow-hidden shrink-0 border border-line2" onClick={toggle}>
        <span className="block w-full h-full" style={{ background: colorCss(value) }} />
      </button>
      {boundName ? (
        <span className="flex items-center gap-1 min-w-0 text-[11px] text-accent" title="Linked to a theme color">
          <Link2 size={11} className="shrink-0" />
          <span className="truncate">{boundName}</span>
          <button className="text-t2 hover:text-t0 shrink-0" title="Detach from theme color" onClick={() => onChange(value, false, null)}>
            <Unlink size={11} />
          </button>
        </span>
      ) : (
        <>
          <span
            className={`font-mono text-[11px] ${keyState === 'keyed' ? 'text-key' : keyState === 'animated' ? 'text-anim' : 'text-t1'}`}
          >
            {colorToHex(value).slice(1).toUpperCase()}
          </span>
          <span className="text-t2 text-[11px]">{Math.round(colorAlpha(value) * 100)}%</span>
        </>
      )}
      {open &&
        createPortal(
          <div ref={popRef} className="menu fixed z-[300]" style={{ left: open.left, top: open.top }}>
            <ColorPicker value={value} onChange={onChange} boundSwatch={boundSwatch} />
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Keyframe diamond shown next to animatable properties in animate mode. */
export function KeyButton({ state, onClick }: { state: KeyState; onClick: () => void }) {
  return (
    <button
      className="w-4 h-4 flex items-center justify-center shrink-0"
      onClick={onClick}
      title={state === 'keyed' ? 'Remove key' : 'Add key'}
    >
      <svg width="9" height="9" viewBox="0 0 10 10">
        <path
          d="M5 0.5 9.5 5 5 9.5 0.5 5Z"
          fill={state === 'keyed' ? 'var(--key)' : 'none'}
          stroke={state === 'none' ? '#666' : state === 'animated' ? 'var(--anim)' : 'var(--key)'}
          strokeWidth="1.2"
        />
      </svg>
    </button>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-h-[28px]">
      <span className="label w-[64px] shrink-0 truncate">{label}</span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={`field ${className}`}
      disabled={disabled}
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
