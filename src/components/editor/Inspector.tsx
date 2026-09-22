'use client';
import { useMemo } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Eye,
  EyeOff,
  Minus,
  Plus,
} from 'lucide-react';
import { ArtboardDoc, CoreObj } from '@/lib/rive/document';
import { obj } from '@/lib/rive/factory';
import {
  childrenOf,
  findArtboard,
  findObj,
  isAnimatable,
  isKeyed,
  keyedPropertyFor,
  keyframeAt,
  removeKeyframes,
  upsertKeyframe,
} from '@/lib/rive/ops';
import { artboardPos, buildScene, isEmpty, objectBounds, prop, sampleAnimation, Overrides, invert, apply, setArtboardPos } from '@/lib/rive/scene';
import { isA, propDef } from '@/lib/rive/schema';
import { useEditor } from '@/lib/store/editor';
import { ColorSwatch, KeyButton, NumberField, Row, Select, TextField } from './controls';
import { bindingOf } from '@/lib/rive/theme';
import { BUNDLED_FONTS, ensureFontAsset, fontAssets, textRuns, textStyles } from '@/lib/rive/text';
import { loadBundledFont } from '@/lib/client/fonts';
import { ARTBOARD_PRESETS } from '@/lib/rive/presets';
import { displayName } from './Hierarchy';
import { StateMachineInspector } from './StateMachinePanel';

const BLEND_MODES = [
  { value: 3, label: 'Normal' },
  { value: 24, label: 'Multiply' },
  { value: 14, label: 'Screen' },
  { value: 15, label: 'Overlay' },
  { value: 16, label: 'Darken' },
  { value: 17, label: 'Lighten' },
  { value: 18, label: 'Color Dodge' },
  { value: 19, label: 'Color Burn' },
  { value: 20, label: 'Hard Light' },
  { value: 21, label: 'Soft Light' },
  { value: 22, label: 'Difference' },
  { value: 23, label: 'Exclusion' },
  { value: 25, label: 'Hue' },
  { value: 26, label: 'Saturation' },
  { value: 27, label: 'Color' },
  { value: 28, label: 'Luminosity' },
];

type KeyState = 'none' | 'animated' | 'keyed';

/** Reads/writes properties of one object, aware of animate mode keyframes. */
function useBinding(ab: ArtboardDoc | undefined, overrides: Overrides) {
  const mode = useEditor((s) => s.mode);
  const animationId = useEditor((s) => s.animationId);
  const frame = useEditor((s) => Math.round(s.frame));
  const readOnly = useEditor((s) => s.readOnly);
  const anim = ab?.animations.find((a) => a.id === animationId);
  const animating = mode === 'animate' && !!anim;
  return {
    animating,
    readOnly,
    get: <T = number,>(o: CoreObj, name: string): T => prop<T>(o, name, overrides),
    set: (o: CoreObj, values: Record<string, unknown>, transient = false) => {
      useEditor.getState().setProps(o.id, values, transient);
    },
    keyState: (o: CoreObj, name: string): KeyState => {
      if (!animating || !isAnimatable(o.type, name)) return 'none';
      if (keyframeAt(anim, o.id, o.type, name, frame)) return 'keyed';
      if (isKeyed(anim, o.id, o.type, name)) return 'animated';
      return 'none';
    },
    setColor: (o: CoreObj, name: string, v: number, swatchId: string | null | undefined, transient = false) => {
      useEditor.getState().setColor(o.id, name, v, swatchId ?? null, transient);
    },
    /** theme swatch the property is bound to (the keyframe at the playhead in animate mode) */
    bound: (o: CoreObj, name: string): string | undefined => {
      if (animating && isAnimatable(o.type, name)) {
        const kf = keyframeAt(anim, o.id, o.type, name, frame);
        if (kf) return bindingOf(kf, 'value');
        if (isKeyed(anim, o.id, o.type, name)) return undefined;
      }
      return bindingOf(o, name);
    },
    toggleKey: (o: CoreObj, names: string[]) => {
      if (!anim || !ab) return;
      useEditor.getState().commit((d) => {
        const a = findArtboard(d, ab.id)!;
        const an = a.animations.find((x) => x.id === anim.id)!;
        const target = findObj(a, o.id)!;
        const existing = names.map((n) => keyframeAt(an, o.id, o.type, n, frame)).filter((k): k is CoreObj => !!k);
        if (existing.length === names.length) {
          removeKeyframes(a, an, new Set(existing.map((k) => k.id)));
        } else {
          for (const n of names) upsertKeyframe(an, target, n, prop(target, n, overrides), frame);
        }
      });
    },
  };
}
type Binding = ReturnType<typeof useBinding>;

function Num({
  b,
  o,
  name,
  label,
  scale,
  precision,
  step,
  min,
  max,
  suffix,
}: {
  b: Binding;
  o: CoreObj;
  name: string;
  label?: string;
  scale?: number;
  precision?: number;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <NumberField
      label={label}
      value={b.get(o, name)}
      scale={scale}
      precision={precision}
      step={step}
      min={min}
      max={max}
      suffix={suffix}
      disabled={b.readOnly}
      keyState={b.keyState(o, name)}
      onChange={(v, t) => b.set(o, { [name]: v }, t)}
    />
  );
}

function Key({ b, o, names }: { b: Binding; o: CoreObj; names: string[] }) {
  if (!b.animating) return null;
  const states = names.map((n) => b.keyState(o, n));
  const st: KeyState = states.every((s) => s === 'keyed') ? 'keyed' : states.some((s) => s !== 'none') ? 'animated' : 'none';
  return <KeyButton state={st} onClick={() => b.toggleKey(o, names)} />;
}

export function Inspector() {
  const doc = useEditor((s) => s.doc);
  const activeArtboardId = useEditor((s) => s.activeArtboardId);
  const selection = useEditor((s) => s.selection);
  const mode = useEditor((s) => s.mode);
  const animationId = useEditor((s) => s.animationId);
  const frame = useEditor((s) => s.frame);
  const stateMachineId = useEditor((s) => s.stateMachineId);
  const smSelection = useEditor((s) => s.smSelection);
  const ab = doc ? findArtboard(doc, activeArtboardId) : undefined;
  const overrides = useMemo(() => {
    if (!ab || mode !== 'animate') return new Map() as Overrides;
    const anim = ab.animations.find((a) => a.id === animationId);
    return sampleAnimation(ab, anim, frame);
  }, [ab, mode, animationId, frame]);
  const b = useBinding(ab, overrides);

  if (!ab) return <div className="p-4 text-t2">No artboard</div>;

  if (mode === 'animate' && stateMachineId && smSelection) {
    return (
      <div className="flex-1 overflow-auto">
        <StateMachineInspector />
      </div>
    );
  }

  const objs = selection.map((id) => findObj(ab, id)).filter((o): o is CoreObj => !!o);

  if (!objs.length) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="section text-t2">Nothing selected. Showing the active artboard.</div>
        <ArtboardSection ab={ab} b={b} />
        <PaintsSection ab={ab} owner={ab.artboard} b={b} />
      </div>
    );
  }
  if (objs.length > 1) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="section">
          <div className="panel-title mb-2">{objs.length} objects</div>
          <AlignTools ab={ab} ids={objs.map((o) => o.id)} />
        </div>
      </div>
    );
  }
  const o = objs[0];
  if (o.type === 'Artboard') {
    return (
      <div className="flex-1 overflow-auto">
        <ArtboardSection ab={ab} b={b} />
        <PaintsSection ab={ab} owner={o} b={b} />
      </div>
    );
  }
  const shapePaintOwner = o.type === 'Shape' ? o : o.type === 'Text' ? childrenOf(ab, o.id).find((c) => isA(c.type, 'TextStyle')) ?? null : null;
  const kids = childrenOf(ab, o.id);
  return (
    <div className="flex-1 overflow-auto">
      <div className="section flex items-center gap-2">
        <TextField value={displayName(o)} onChange={(v) => b.set(o, { name: v })} />
        <span className="text-t2 text-[11px] shrink-0">{o.type.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
      </div>
      {isA(o.type, 'Vertex') ? (
        <VertexSection o={o} b={b} />
      ) : (
        <>
          {isA(o.type, 'Node') && <TransformSection o={o} b={b} />}
          {isA(o.type, 'ParametricPath') && <ParametricSection o={o} b={b} />}
          {o.type === 'Shape' &&
            kids
              .filter((k) => isA(k.type, 'ParametricPath'))
              .slice(0, 1)
              .map((p) => <ParametricSection key={p.id} o={p} b={b} title={displayName(p)} />)}
          {o.type === 'PointsPath' && <PointsPathSection o={o} b={b} ab={ab} />}
          {o.type === 'Text' && <TextSection o={o} b={b} ab={ab} />}
          {isA(o.type, 'WorldTransformComponent') && <DrawableSection o={o} b={b} />}
          {shapePaintOwner && <PaintsSection ab={ab} owner={shapePaintOwner} b={b} />}
        </>
      )}
    </div>
  );
}

function ArtboardSection({ ab, b }: { ab: ArtboardDoc; b: Binding }) {
  const a = ab.artboard;
  const setDesign = (values: Record<string, unknown>) =>
    useEditor.getState().commit((d) => {
      Object.assign(findArtboard(d, ab.id)!.artboard.props, values);
    });
  const setPos = (x: number, y: number) =>
    useEditor.getState().commit((d) => setArtboardPos(findArtboard(d, ab.id)!.artboard, x, y));
  return (
    <div className="section flex flex-col gap-1.5">
      <div className="flex items-center gap-2 mb-1">
        <TextField value={displayName(a)} onChange={(v) => setDesign({ name: v })} />
        <span className="text-t2 text-[11px] shrink-0">Artboard</span>
      </div>
      <Row label="Position">
        <NumberField
          label="X"
          value={artboardPos(a).x}
          disabled={b.readOnly}
          onChange={(v) => setPos(v, artboardPos(a).y)}
        />
        <NumberField
          label="Y"
          value={artboardPos(a).y}
          disabled={b.readOnly}
          onChange={(v) => setPos(artboardPos(a).x, v)}
        />
      </Row>
      <Row label="Size">
        <Num b={b} o={a} name="width" label="W" min={1} />
        <Num b={b} o={a} name="height" label="H" min={1} />
        <Key b={b} o={a} names={['width', 'height']} />
      </Row>
      <Row label="Preset">
        <Select
          value=""
          options={[{ value: '', label: 'Choose a size…' }, ...ARTBOARD_PRESETS.map((p) => ({ value: p.label, label: `${p.label} (${p.w}×${p.h})` }))]}
          onChange={(v) => {
            const p = ARTBOARD_PRESETS.find((x) => x.label === v);
            if (p) setDesign({ width: p.w, height: p.h });
          }}
        />
      </Row>
      <Row label="Origin">
        <Num b={b} o={a} name="originX" label="X" scale={100} precision={1} suffix="%" />
        <Num b={b} o={a} name="originY" label="Y" scale={100} precision={1} suffix="%" />
      </Row>
      <Row label="Clip">
        <input type="checkbox" checked={b.get<boolean>(a, 'clip')} disabled={b.readOnly} onChange={(e) => b.set(a, { clip: e.target.checked })} />
        <span className="text-t2">Clip contents to artboard bounds</span>
      </Row>
    </div>
  );
}

function TransformSection({ o, b }: { o: CoreObj; b: Binding }) {
  return (
    <div className="section flex flex-col gap-1.5">
      <div className="panel-title mb-1">Transform</div>
      <Row label="Position">
        <Num b={b} o={o} name="x" label="X" />
        <Num b={b} o={o} name="y" label="Y" />
        <Key b={b} o={o} names={['x', 'y']} />
      </Row>
      <Row label="Rotation">
        <Num b={b} o={o} name="rotation" label="°" scale={180 / Math.PI} precision={2} />
        <div className="flex-1" />
        <Key b={b} o={o} names={['rotation']} />
      </Row>
      <Row label="Scale">
        <Num b={b} o={o} name="scaleX" label="X" step={0.01} precision={3} />
        <Num b={b} o={o} name="scaleY" label="Y" step={0.01} precision={3} />
        <Key b={b} o={o} names={['scaleX', 'scaleY']} />
      </Row>
    </div>
  );
}

function DrawableSection({ o, b }: { o: CoreObj; b: Binding }) {
  return (
    <div className="section flex flex-col gap-1.5">
      <div className="panel-title mb-1">Appearance</div>
      <Row label="Opacity">
        <Num b={b} o={o} name="opacity" scale={100} precision={1} min={0} max={1} suffix="%" />
        <Key b={b} o={o} names={['opacity']} />
      </Row>
      {isA(o.type, 'Drawable') && (
        <Row label="Blend">
          <Select value={b.get(o, 'blendModeValue')} options={BLEND_MODES} onChange={(v) => b.set(o, { blendModeValue: v })} />
        </Row>
      )}
    </div>
  );
}

function ParametricSection({ o, b, title }: { o: CoreObj; b: Binding; title?: string }) {
  const linked = b.get<boolean>(o, 'linkCornerRadius');
  return (
    <div className="section flex flex-col gap-1.5">
      <div className="panel-title mb-1">{title ?? 'Path'}</div>
      <Row label="Size">
        <Num b={b} o={o} name="width" label="W" />
        <Num b={b} o={o} name="height" label="H" />
        <Key b={b} o={o} names={['width', 'height']} />
      </Row>
      <Row label="Origin">
        <Num b={b} o={o} name="originX" label="X" scale={100} precision={1} suffix="%" />
        <Num b={b} o={o} name="originY" label="Y" scale={100} precision={1} suffix="%" />
        <Key b={b} o={o} names={['originX', 'originY']} />
      </Row>
      {o.type === 'Rectangle' && (
        <>
          <Row label="Corners">
            <Num b={b} o={o} name="cornerRadiusTL" label="R" min={0} />
            <label className="flex items-center gap-1 text-t2 shrink-0">
              <input type="checkbox" checked={linked} disabled={b.readOnly} onChange={(e) => b.set(o, { linkCornerRadius: e.target.checked })} />
              Link
            </label>
            <Key b={b} o={o} names={linked ? ['cornerRadiusTL'] : ['cornerRadiusTL', 'cornerRadiusTR', 'cornerRadiusBL', 'cornerRadiusBR']} />
          </Row>
          {!linked && (
            <>
              <Row label="">
                <Num b={b} o={o} name="cornerRadiusTR" label="TR" min={0} />
                <Num b={b} o={o} name="cornerRadiusBR" label="BR" min={0} />
              </Row>
              <Row label="">
                <Num b={b} o={o} name="cornerRadiusBL" label="BL" min={0} />
                <div className="flex-1" />
              </Row>
            </>
          )}
        </>
      )}
      {(o.type === 'Polygon' || o.type === 'Star') && (
        <Row label="Points">
          <NumberField
            value={b.get(o, 'points')}
            precision={0}
            min={3}
            max={100}
            disabled={b.readOnly}
            onChange={(v, t) => b.set(o, { points: Math.round(v) }, t)}
          />
          <Num b={b} o={o} name="cornerRadius" label="R" min={0} />
          <Key b={b} o={o} names={['cornerRadius']} />
        </Row>
      )}
      {o.type === 'Star' && (
        <Row label="Inner">
          <Num b={b} o={o} name="innerRadius" scale={100} precision={1} min={0} suffix="%" />
          <Key b={b} o={o} names={['innerRadius']} />
        </Row>
      )}
    </div>
  );
}

function PointsPathSection({ o, b, ab }: { o: CoreObj; b: Binding; ab: ArtboardDoc }) {
  const verts = childrenOf(ab, o.id).filter((c) => isA(c.type, 'PathVertex'));
  return (
    <div className="section flex flex-col gap-1.5">
      <div className="panel-title mb-1">Path</div>
      <Row label="Closed">
        <input type="checkbox" checked={b.get<boolean>(o, 'isClosed')} disabled={b.readOnly} onChange={(e) => b.set(o, { isClosed: e.target.checked })} />
        <span className="text-t2">{verts.length} vertices</span>
      </Row>
      <button className="btn h-7" onClick={() => useEditor.getState().set('editPathId', o.id)}>
        Edit vertices
      </button>
    </div>
  );
}

const VERTEX_TYPES = [
  { value: 'StraightVertex', label: 'Straight' },
  { value: 'CubicMirroredVertex', label: 'Mirrored' },
  { value: 'CubicAsymmetricVertex', label: 'Asymmetric' },
  { value: 'CubicDetachedVertex', label: 'Detached' },
];

function VertexSection({ o, b }: { o: CoreObj; b: Binding }) {
  return (
    <div className="section flex flex-col gap-1.5">
      <Row label="Position">
        <Num b={b} o={o} name="x" label="X" />
        <Num b={b} o={o} name="y" label="Y" />
        <Key b={b} o={o} names={['x', 'y']} />
      </Row>
      {o.type === 'StraightVertex' && (
        <Row label="Radius">
          <Num b={b} o={o} name="radius" min={0} />
          <Key b={b} o={o} names={['radius']} />
        </Row>
      )}
      <Row label="Type">
        <Select
          value={o.type}
          options={VERTEX_TYPES}
          onChange={(t) =>
            useEditor.getState().commit((d) => {
              for (const a of d.artboards) {
                const v = findObj(a, o.id);
                if (v) convertVertex(v, t);
              }
            })
          }
        />
      </Row>
    </div>
  );
}

function convertVertex(v: CoreObj, type: string) {
  const x = prop(v, 'x');
  const y = prop(v, 'y');
  const base = { parentId: v.props.parentId, x, y, ...(v.props.name ? { name: v.props.name } : {}) };
  const d = 30;
  v.type = type;
  if (type === 'StraightVertex') v.props = { ...base, radius: 0 };
  else if (type === 'CubicMirroredVertex') v.props = { ...base, rotation: 0, distance: d };
  else if (type === 'CubicAsymmetricVertex') v.props = { ...base, rotation: 0, inDistance: d, outDistance: d };
  else v.props = { ...base, inRotation: Math.PI, inDistance: d, outRotation: 0, outDistance: d };
}

// ---------------------------------------------------------------------------
// Paints

function PaintsSection({ ab, owner, b }: { ab: ArtboardDoc; owner: CoreObj; b: Binding }) {
  const paints = childrenOf(ab, owner.id).filter((c) => isA(c.type, 'ShapePaint'));
  const fills = paints.filter((p) => p.type === 'Fill');
  const strokes = paints.filter((p) => p.type === 'Stroke');
  const add = (type: 'Fill' | 'Stroke') =>
    useEditor.getState().commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const paint = obj(type, { name: type, parentId: owner.id, ...(type === 'Stroke' ? { thickness: 2 } : {}) });
      const color = obj('SolidColor', { parentId: paint.id, colorValue: type === 'Fill' ? 0xffc4c4c4 : 0xffffffff });
      a.objects.push(paint, color);
    });
  return (
    <>
      <div className="section flex flex-col gap-2">
        <div className="flex items-center">
          <span className="panel-title flex-1">Fills</span>
          <button className="icon-btn" disabled={b.readOnly} onClick={() => add('Fill')} title="Add fill">
            <Plus size={14} />
          </button>
        </div>
        {fills.map((p) => (
          <PaintRow key={p.id} ab={ab} paint={p} b={b} />
        ))}
      </div>
      {owner.type !== 'Artboard' && (
        <div className="section flex flex-col gap-2">
          <div className="flex items-center">
            <span className="panel-title flex-1">Strokes</span>
            <button className="icon-btn" disabled={b.readOnly} onClick={() => add('Stroke')} title="Add stroke">
              <Plus size={14} />
            </button>
          </div>
          {strokes.map((p) => (
            <PaintRow key={p.id} ab={ab} paint={p} b={b} />
          ))}
        </div>
      )}
    </>
  );
}

function PaintRow({ ab, paint, b }: { ab: ArtboardDoc; paint: CoreObj; b: Binding }) {
  const mutator = childrenOf(ab, paint.id).find((c) => c.type === 'SolidColor' || isA(c.type, 'LinearGradient'));
  const kind = !mutator ? 'none' : mutator.type === 'SolidColor' ? 'solid' : mutator.type === 'RadialGradient' ? 'radial' : 'linear';
  const visible = b.get<boolean>(paint, 'isVisible');
  const commit = useEditor.getState().commit;

  const setKind = (k: string) =>
    commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const old = mutator ? a.objects.find((o) => o.id === mutator.id) : undefined;
      let color = 0xffc4c4c4;
      if (old?.type === 'SolidColor') color = prop(old, 'colorValue');
      else if (old) {
        const stop = a.objects.find((o) => o.type === 'GradientStop' && o.props.parentId === old.id);
        if (stop) color = prop(stop, 'colorValue');
      }
      // remove old mutator (and its stops)
      if (old) {
        a.objects = a.objects.filter((o) => o.id !== old.id && o.props.parentId !== old.id);
        for (const an of a.animations) an.children = (an.children ?? []).filter((ko) => ko.props.objectId !== old.id);
      }
      if (k === 'solid') {
        a.objects.push(obj('SolidColor', { parentId: paint.id, colorValue: color }));
      } else {
        // size the gradient to the owner's bounds
        const scene = buildScene(a);
        const ownerId = paint.props.parentId as string;
        const ownerNode = scene.nodes.get(ownerId);
        const bb = ownerNode ? objectBounds(scene, ownerId, invert(ownerNode.world)) : null;
        const x0 = bb && !isEmpty(bb) ? bb.minX : -50;
        const x1 = bb && !isEmpty(bb) ? bb.maxX : 50;
        const cy = bb && !isEmpty(bb) ? (bb.minY + bb.maxY) / 2 : 0;
        const cx = (x0 + x1) / 2;
        const g = obj(k === 'radial' ? 'RadialGradient' : 'LinearGradient', {
          parentId: paint.id,
          startX: k === 'radial' ? cx : x0,
          startY: cy,
          endX: x1,
          endY: cy,
        });
        a.objects.push(
          g,
          obj('GradientStop', { parentId: g.id, colorValue: color, position: 0 }),
          obj('GradientStop', { parentId: g.id, colorValue: 0xff000000 | (~color & 0xffffff), position: 1 }),
        );
      }
    });

  const remove = () =>
    commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const doomed = new Set<string>([paint.id]);
      for (const o of a.objects) if (o.props.parentId && doomed.has(o.props.parentId as string)) doomed.add(o.id);
      for (const o of a.objects) if (o.props.parentId && doomed.has(o.props.parentId as string)) doomed.add(o.id);
      a.objects = a.objects.filter((o) => !doomed.has(o.id));
      for (const an of a.animations) an.children = (an.children ?? []).filter((ko) => !doomed.has(ko.props.objectId as string));
    });

  return (
    <div className="flex flex-col gap-1.5 bg-bg2/60 rounded-md p-1.5">
      <div className="flex items-center gap-1.5">
        <button className="icon-btn w-6 h-6" disabled={b.readOnly} onClick={() => b.set(paint, { isVisible: !visible })} title="Toggle visibility">
          {visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <Select
          className="w-[84px] shrink-0"
          value={kind}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'linear', label: 'Linear' },
            { value: 'radial', label: 'Radial' },
          ]}
          onChange={setKind}
        />
        {mutator?.type === 'SolidColor' && (
          <>
            <ColorSwatch
              value={b.get(mutator, 'colorValue')}
              keyState={b.keyState(mutator, 'colorValue')}
              boundSwatch={b.bound(mutator, 'colorValue')}
              onChange={(v, t, sw) => b.setColor(mutator, 'colorValue', v, sw, t)}
            />
            <Key b={b} o={mutator} names={['colorValue']} />
          </>
        )}
        <div className="flex-1" />
        <button className="icon-btn w-6 h-6" disabled={b.readOnly} onClick={remove} title="Remove">
          <Minus size={13} />
        </button>
      </div>
      {mutator && isA(mutator.type, 'LinearGradient') && <GradientEditor ab={ab} g={mutator} b={b} />}
      {paint.type === 'Stroke' && (
        <>
          <Row label="Thickness">
            <Num b={b} o={paint} name="thickness" min={0} />
            <Key b={b} o={paint} names={['thickness']} />
          </Row>
          <Row label="Cap / Join">
            <Select
              value={b.get(paint, 'cap')}
              options={[
                { value: 0, label: 'Butt' },
                { value: 1, label: 'Round' },
                { value: 2, label: 'Square' },
              ]}
              onChange={(v) => b.set(paint, { cap: v })}
            />
            <Select
              value={b.get(paint, 'join')}
              options={[
                { value: 0, label: 'Miter' },
                { value: 1, label: 'Round' },
                { value: 2, label: 'Bevel' },
              ]}
              onChange={(v) => b.set(paint, { join: v })}
            />
          </Row>
          <TrimPathRow ab={ab} paint={paint} b={b} />
        </>
      )}
      {paint.type === 'Fill' && paint.props.parentId !== ab.artboard.id && (
        <Row label="Fill rule">
          <Select
            value={b.get(paint, 'fillRule')}
            options={[
              { value: 0, label: 'Non-zero' },
              { value: 1, label: 'Even-odd' },
            ]}
            onChange={(v) => b.set(paint, { fillRule: v })}
          />
        </Row>
      )}
    </div>
  );
}

function TrimPathRow({ ab, paint, b }: { ab: ArtboardDoc; paint: CoreObj; b: Binding }) {
  const trim = childrenOf(ab, paint.id).find((c) => c.type === 'TrimPath');
  const commit = useEditor.getState().commit;
  if (!trim) {
    return (
      <button
        className="text-left text-accent text-[11px] px-1"
        disabled={b.readOnly}
        onClick={() =>
          commit((d) => {
            findArtboard(d, ab.id)!.objects.push(obj('TrimPath', { parentId: paint.id, start: 0, end: 1, offset: 0, modeValue: 1 }));
          })
        }
      >
        + Add trim path
      </button>
    );
  }
  return (
    <>
      <Row label="Trim">
        <Num b={b} o={trim} name="start" label="S" scale={100} precision={1} suffix="%" />
        <Num b={b} o={trim} name="end" label="E" scale={100} precision={1} suffix="%" />
        <Key b={b} o={trim} names={['start', 'end']} />
      </Row>
      <Row label="Offset">
        <Num b={b} o={trim} name="offset" scale={360} precision={1} suffix="°" />
        <Select
          value={b.get(trim, 'modeValue')}
          options={[
            { value: 1, label: 'Sequential' },
            { value: 2, label: 'Synced' },
          ]}
          onChange={(v) => b.set(trim, { modeValue: v })}
        />
        <Key b={b} o={trim} names={['offset']} />
        <button
          className="icon-btn w-5 h-5"
          onClick={() =>
            commit((d) => {
              const a = findArtboard(d, ab.id)!;
              a.objects = a.objects.filter((o) => o.id !== trim.id);
            })
          }
        >
          <Minus size={12} />
        </button>
      </Row>
    </>
  );
}

function GradientEditor({ ab, g, b }: { ab: ArtboardDoc; g: CoreObj; b: Binding }) {
  const stops = childrenOf(ab, g.id)
    .filter((c) => c.type === 'GradientStop')
    .sort((x, y) => b.get(x, 'position') - b.get(y, 'position'));
  const css = `linear-gradient(to right, ${stops
    .map((s) => {
      const c = b.get(s, 'colorValue') >>> 0;
      return `rgba(${(c >>> 16) & 255},${(c >>> 8) & 255},${c & 255},${((c >>> 24) & 255) / 255}) ${b.get(s, 'position') * 100}%`;
    })
    .join(',')})`;
  const commit = useEditor.getState().commit;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-4 rounded checker overflow-hidden">
        <div className="w-full h-full" style={{ background: css }} />
      </div>
      <Row label="Start">
        <Num b={b} o={g} name="startX" label="X" />
        <Num b={b} o={g} name="startY" label="Y" />
        <Key b={b} o={g} names={['startX', 'startY']} />
      </Row>
      <Row label="End">
        <Num b={b} o={g} name="endX" label="X" />
        <Num b={b} o={g} name="endY" label="Y" />
        <Key b={b} o={g} names={['endX', 'endY']} />
      </Row>
      <Row label="Opacity">
        <Num b={b} o={g} name="opacity" scale={100} precision={1} min={0} max={1} suffix="%" />
        <Key b={b} o={g} names={['opacity']} />
      </Row>
      {stops.map((s) => (
        <div key={s.id} className="flex items-center gap-1.5">
          <NumberField
            className="w-16 shrink-0"
            value={b.get(s, 'position')}
            scale={100}
            precision={1}
            min={0}
            max={1}
            suffix="%"
            keyState={b.keyState(s, 'position')}
            onChange={(v, t) => b.set(s, { position: v }, t)}
          />
          <ColorSwatch
            value={b.get(s, 'colorValue')}
            keyState={b.keyState(s, 'colorValue')}
            boundSwatch={b.bound(s, 'colorValue')}
            onChange={(v, t, sw) => b.setColor(s, 'colorValue', v, sw, t)}
          />
          <Key b={b} o={s} names={['colorValue', 'position']} />
          <button
            className="icon-btn w-5 h-5"
            disabled={stops.length <= 2 || b.readOnly}
            onClick={() =>
              commit((d) => {
                const a = findArtboard(d, ab.id)!;
                a.objects = a.objects.filter((o) => o.id !== s.id);
              })
            }
          >
            <Minus size={12} />
          </button>
        </div>
      ))}
      <button
        className="text-left text-accent text-[11px] px-1"
        disabled={b.readOnly}
        onClick={() =>
          commit((d) => {
            findArtboard(d, ab.id)!.objects.push(obj('GradientStop', { parentId: g.id, colorValue: 0xffffffff, position: 0.5 }));
          })
        }
      >
        + Add stop
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Align

function AlignTools({ ab, ids }: { ab: ArtboardDoc; ids: string[] }) {
  const align = (how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    const s = useEditor.getState();
    const scene = buildScene(ab);
    const boxes = ids.map((id) => ({ id, b: objectBounds(scene, id) })).filter((x) => !isEmpty(x.b));
    if (!boxes.length) return;
    const minX = Math.min(...boxes.map((x) => x.b.minX));
    const maxX = Math.max(...boxes.map((x) => x.b.maxX));
    const minY = Math.min(...boxes.map((x) => x.b.minY));
    const maxY = Math.max(...boxes.map((x) => x.b.maxY));
    s.beginGesture();
    for (const { id, b } of boxes) {
      let dx = 0;
      let dy = 0;
      if (how === 'left') dx = minX - b.minX;
      if (how === 'right') dx = maxX - b.maxX;
      if (how === 'hcenter') dx = (minX + maxX) / 2 - (b.minX + b.maxX) / 2;
      if (how === 'top') dy = minY - b.minY;
      if (how === 'bottom') dy = maxY - b.maxY;
      if (how === 'vcenter') dy = (minY + maxY) / 2 - (b.minY + b.maxY) / 2;
      const n = scene.nodes.get(id)!;
      const o = n.obj;
      if (!isA(o.type, 'Node')) continue;
      const pinv = invert(n.parent ? scene.nodes.get(n.parent)!.world : [1, 0, 0, 1, 0, 0]);
      const [ldx, ldy] = [pinv[0] * dx + pinv[2] * dy, pinv[1] * dx + pinv[3] * dy];
      s.setProps(id, { x: prop(o, 'x') + ldx, y: prop(o, 'y') + ldy });
    }
    s.endGesture();
    void apply;
  };
  const btn = (how: Parameters<typeof align>[0], icon: React.ReactNode, title: string) => (
    <button className="icon-btn" onClick={() => align(how)} title={title}>
      {icon}
    </button>
  );
  return (
    <div className="flex gap-0.5">
      {btn('left', <AlignStartVertical size={14} />, 'Align left')}
      {btn('hcenter', <AlignCenterVertical size={14} />, 'Align horizontal centers')}
      {btn('right', <AlignEndVertical size={14} />, 'Align right')}
      {btn('top', <AlignStartHorizontal size={14} />, 'Align top')}
      {btn('vcenter', <AlignCenterHorizontal size={14} />, 'Align vertical centers')}
      {btn('bottom', <AlignEndHorizontal size={14} />, 'Align bottom')}
    </div>
  );
}

export { keyedPropertyFor, propDef };



function TextSection({ o, b, ab }: { o: CoreObj; b: Binding; ab: ArtboardDoc }) {
  const doc = useEditor((st) => st.doc)!;
  const runs = textRuns(ab, o.id);
  const styles = textStyles(ab, o.id);
  const style = styles[0];
  const text = runs.map((r) => String(r.props.text ?? '')).join('');
  const fonts = fontAssets(doc);
  const commit = useEditor.getState().commit;
  const setAllStyles = (values: Record<string, unknown>) =>
    commit((d) => {
      const a = findArtboard(d, ab.id)!;
      for (const st of textStyles(a, o.id)) Object.assign(st.props, values);
    });
  const setFont = async (value: string) => {
    if (value === '__upload') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ttf,.otf,font/ttf,font/otf';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        const bytes = new Uint8Array(await f.arrayBuffer());
        commit((d) => {
          const id = ensureFontAsset(d, f.name.replace(/\.(ttf|otf)$/i, ''), bytes);
          for (const st of textStyles(findArtboard(d, ab.id)!, o.id)) st.props.fontAssetId = id;
        });
      };
      input.click();
      return;
    }
    if (value.startsWith('bundled:')) {
      const font = await loadBundledFont(value.slice(8));
      commit((d) => {
        const id = ensureFontAsset(d, font.name, font.bytes);
        for (const st of textStyles(findArtboard(d, ab.id)!, o.id)) st.props.fontAssetId = id;
      });
      return;
    }
    setAllStyles({ fontAssetId: value });
  };
  const sizing = b.get(o, 'sizingValue');
  return (
    <div className="section flex flex-col gap-1.5">
      <div className="panel-title mb-1">Text</div>
      <textarea
        className="field h-auto min-h-[60px] py-1 resize-y font-sans"
        value={text}
        disabled={b.readOnly}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) =>
          commit((d) => {
            const a = findArtboard(d, ab.id)!;
            const rs = textRuns(a, o.id);
            if (!rs.length) return;
            rs[0].props.text = e.target.value;
            if (rs.length > 1) a.objects = a.objects.filter((x) => !rs.slice(1).includes(x));
          })
        }
      />
      {runs.length > 1 && <div className="text-t3 text-[11px]">{runs.length} styled runs. Editing here merges them.</div>}
      <Row label="Font">
        <Select
          value={typeof style?.props.fontAssetId === 'string' ? style.props.fontAssetId : ''}
          options={[
            ...fonts.map((f) => ({ value: f.id, label: String(f.props.name || 'Embedded font') })),
            ...BUNDLED_FONTS.filter((bf) => !fonts.some((f) => f.props.name === bf.name)).map((bf) => ({ value: `bundled:${bf.name}`, label: `${bf.name} (add)` })),
            { value: '__upload', label: 'Upload font file…' },
          ]}
          onChange={setFont}
        />
      </Row>
      {style && (
        <>
          <Row label="Size">
            <Num b={b} o={style} name="fontSize" min={1} />
            <Key b={b} o={style} names={['fontSize']} />
          </Row>
          <Row label="Spacing">
            <NumberField
              label="L"
              value={b.get(style, 'lineHeight')}
              step={0.5}
              disabled={b.readOnly}
              onChange={(v) => setAllStyles({ lineHeight: v })}
            />
            <Num b={b} o={style} name="letterSpacing" label="A" step={0.1} />
            <Key b={b} o={style} names={['letterSpacing']} />
          </Row>
        </>
      )}
      <Row label="Align">
        <Select
          value={b.get(o, 'alignValue')}
          options={[
            { value: 0, label: 'Left' },
            { value: 2, label: 'Center' },
            { value: 1, label: 'Right' },
          ]}
          onChange={(v) => b.set(o, { alignValue: v })}
        />
      </Row>
      <Row label="Sizing">
        <Select
          value={sizing}
          options={[
            { value: 0, label: 'Auto width' },
            { value: 1, label: 'Auto height' },
            { value: 2, label: 'Fixed' },
          ]}
          onChange={(v) => b.set(o, { sizingValue: v, ...(v !== 0 && !b.get(o, 'width') ? { width: 200, height: 100 } : {}) })}
        />
      </Row>
      {sizing !== 0 && (
        <Row label="Box">
          <Num b={b} o={o} name="width" label="W" min={1} />
          {sizing === 2 && <Num b={b} o={o} name="height" label="H" min={1} />}
        </Row>
      )}
      <Row label="Overflow">
        <Select
          value={b.get(o, 'overflowValue')}
          options={[
            { value: 0, label: 'Visible' },
            { value: 1, label: 'Hidden' },
            { value: 2, label: 'Clipped' },
            { value: 3, label: 'Ellipsis' },
          ]}
          onChange={(v) => b.set(o, { overflowValue: v })}
        />
      </Row>
      <Row label="Origin">
        <Num b={b} o={o} name="originX" label="X" scale={100} precision={0} suffix="%" />
        <Num b={b} o={o} name="originY" label="Y" scale={100} precision={0} suffix="%" />
      </Row>
      <div className="text-t3 text-[11px]">Double-click the text on the stage (or press Enter) to edit it in place.</div>
    </div>
  );
}
