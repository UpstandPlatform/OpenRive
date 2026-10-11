'use client';
import { useState } from 'react';
import { ArtboardDoc, CoreObj } from '@openrive/rive/document';
import { addSkin, autoWeightSkin, rebindSkin, setBoneParent, setSkinWeights, smoothSkinWeights, unbindSkin, WeightChannel } from '@openrive/rive/api';
import { childrenOf, isAncestor } from '@openrive/rive/ops';
import { isA } from '@openrive/rive/schema';
import { adjustInfluence, unpackInfluences } from '@openrive/rive/weights';
import { useEditor } from '@/lib/store/editor';
import { toast } from '@/lib/client/toast';

const name = (object: CoreObj) => String(object.props.name || object.type);
const mutate = (recipe: Parameters<ReturnType<typeof useEditor.getState>['commit']>[0]) => {
  try {
    useEditor.getState().commit(recipe);
  } catch (error) {
    toast((error as Error).message);
  }
};

export function BoneParentControl({ ab, bone, readOnly }: { ab: ArtboardDoc; bone: CoreObj; readOnly: boolean }) {
  const mode = useEditor((state) => state.mode);
  const parent = ab.objects.find((object) => object.id === bone.props.parentId && isA(object.type, 'Bone'));
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2">
        <span className="w-16 text-t2">Parent</span>
        <select
          className="field h-7 min-w-0 flex-1"
          aria-label="Bone parent"
          disabled={readOnly || mode !== 'design'}
          value={parent?.id ?? ''}
          onChange={(event) =>
            mutate((doc) => {
              setBoneParent(doc, { artboard: ab.id, bone: bone.id, parent: event.target.value || undefined });
            })
          }
        >
          <option value="">Artboard (root)</option>
          {ab.objects
            .filter((object) => isA(object.type, 'Bone') && object.id !== bone.id && !isAncestor(ab, bone.id, object.id))
            .map((object) => (
              <option key={object.id} value={object.id}>
                {name(object)}
              </option>
            ))}
        </select>
      </label>
      <p className="text-[11px] leading-relaxed text-t2">Linking attaches this joint to the parent’s tip. Detaching preserves its current position.</p>
    </div>
  );
}

export function SkinControls({ ab, path, readOnly }: { ab: ArtboardDoc; path: CoreObj; readOnly: boolean }) {
  const bones = ab.objects.filter((object) => isA(object.type, 'Bone'));
  const [chosen, setChosen] = useState<string[] | null>(null);
  const paint = useEditor((state) => state.weightPaint);
  const tool = useEditor((state) => state.tool);
  const mode = useEditor((state) => state.mode);
  const skin = childrenOf(ab, path.id).find((object) => object.type === 'Skin');
  const boundBones = skin
    ? childrenOf(ab, skin.id)
        .filter((object) => object.type === 'Tendon')
        .map((tendon) => bones.find((bone) => bone.id === tendon.props.boneId))
        .filter((bone): bone is CoreObj => !!bone)
    : [];
  const selected = (chosen ?? bones.map((bone) => bone.id)).filter((id) => bones.some((bone) => bone.id === id));
  const change = (patch: Partial<typeof paint>) => useEditor.getState().set('weightPaint', { ...paint, ...patch });
  const activate = () => {
    const state = useEditor.getState();
    state.set('weightPaint', {
      ...paint,
      pathId: path.id,
      boneId: boundBones.some((bone) => bone.id === paint.boneId) ? paint.boneId : (boundBones[0]?.id ?? null),
    });
    state.set('editPathId', path.id);
    state.set('tool', 'weight');
  };
  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="panel-title">Skin</div>
      {!skin ? (
        <>
          {bones.length ? (
            <>
              <details>
                <summary className="text-t2 cursor-pointer">Choose bones ({selected.length})</summary>
                <div className="max-h-40 overflow-auto flex flex-col gap-1 py-2">
                  {bones.map((bone) => (
                    <label key={bone.id} className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={selected.includes(bone.id)}
                        onChange={(event) => setChosen(event.target.checked ? [...selected, bone.id] : selected.filter((id) => id !== bone.id))}
                      />
                      <span className="truncate">{name(bone)}</span>
                    </label>
                  ))}
                </div>
              </details>
              <button
                className="btn h-7"
                disabled={readOnly || !selected.length || mode !== 'design'}
                onClick={() =>
                  mutate((doc) => {
                    addSkin(doc, { artboard: ab.id, path: path.id, bones: selected });
                  })
                }
              >
                Bind selected bones
              </button>
              <p className="text-[11px] leading-relaxed text-t2">Binding captures the current pose and assigns weights to nearby bones.</p>
            </>
          ) : (
            <p className="text-[11px] text-t2">Create bones before binding this path.</p>
          )}
        </>
      ) : (
        <>
          <p className="text-[11px] text-t2">
            Bound to {boundBones.length} bone{boundBones.length === 1 ? '' : 's'}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn h-7"
              disabled={readOnly || mode !== 'design'}
              onClick={() => mutate((doc) => autoWeightSkin(doc, { artboard: ab.id, path: path.id }))}
            >
              Auto weight
            </button>
            <button
              className="btn h-7"
              disabled={readOnly || mode !== 'design'}
              onClick={() => mutate((doc) => smoothSkinWeights(doc, { artboard: ab.id, path: path.id }))}
            >
              Smooth weights
            </button>
          </div>
          <button
            className="btn h-7"
            disabled={readOnly || mode !== 'design' || !boundBones.length}
            aria-pressed={tool === 'weight' && paint.pathId === path.id}
            onClick={activate}
          >
            Paint weights (Shift B)
          </button>
          {tool === 'weight' && paint.pathId === path.id && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <span className="w-16 text-t2">Bone</span>
                <select
                  className="field h-7 flex-1 min-w-0"
                  aria-label="Paint bone"
                  disabled={readOnly}
                  value={paint.boneId ?? ''}
                  onChange={(event) => change({ boneId: event.target.value })}
                >
                  {boundBones.map((bone) => (
                    <option key={bone.id} value={bone.id}>
                      {name(bone)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-16 text-t2">Radius</span>
                <input
                  className="w-full min-w-0"
                  type="range"
                  aria-label="Brush radius"
                  min={5}
                  max={200}
                  value={paint.radius}
                  disabled={readOnly}
                  onChange={(event) => change({ radius: Number(event.target.value) })}
                />
                <span className="text-t2 tabular-nums">{paint.radius}</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-16 text-t2">Strength</span>
                <input
                  className="w-full min-w-0"
                  type="range"
                  aria-label="Brush strength"
                  min={1}
                  max={100}
                  value={Math.round(paint.strength * 100)}
                  disabled={readOnly}
                  onChange={(event) => change({ strength: Number(event.target.value) / 100 })}
                />
                <span className="text-t2 tabular-nums">{Math.round(paint.strength * 100)}%</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-16 text-t2">Mode</span>
                <select
                  className="field h-7 flex-1"
                  aria-label="Brush mode"
                  disabled={readOnly}
                  value={paint.mode}
                  onChange={(event) => change({ mode: event.target.value as typeof paint.mode })}
                >
                  <option value="add">Add</option>
                  <option value="subtract">Subtract</option>
                </select>
              </label>
              <ChannelSelect value={paint.channel} disabled={readOnly} onChange={(channel) => change({ channel })} />
              <p className="text-[11px] leading-relaxed text-t2">Paint on the canvas. Hold Alt to subtract. Each stroke is one undo step.</p>
              <button className="btn h-7" onClick={() => useEditor.getState().set('tool', 'select')}>
                Finish painting
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn h-7"
              disabled={readOnly || mode !== 'design'}
              title="Capture the current contour and bone positions as a new bind pose"
              onClick={() => mutate((doc) => rebindSkin(doc, { artboard: ab.id, path: path.id }))}
            >
              Rebind pose
            </button>
            <button
              className="btn h-7"
              disabled={readOnly || mode !== 'design'}
              title="Remove the skin and retain the current contour"
              onClick={() => {
                mutate((doc) => unbindSkin(doc, { artboard: ab.id, path: path.id }));
                useEditor.getState().set('tool', 'select');
              }}
            >
              Unbind skin
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChannelSelect({ value, disabled, onChange }: { value: WeightChannel; disabled: boolean; onChange: (value: WeightChannel) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-16 text-t2">Target</span>
      <select
        className="field h-7 min-w-0 flex-1"
        aria-label="Weight target"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as WeightChannel)}
      >
        <option value="point">Point</option>
        <option value="in">In handle</option>
        <option value="out">Out handle</option>
        <option value="all">Point and handles</option>
      </select>
    </label>
  );
}

export function SkinWeightControls({ vertex, ab }: { vertex: CoreObj; ab: ArtboardDoc }) {
  const [channel, setChannel] = useState<WeightChannel>('point');
  const readOnly = useEditor((state) => state.readOnly || state.mode !== 'design');
  const skin = childrenOf(ab, String(vertex.props.parentId)).find((object) => object.type === 'Skin');
  const weight = childrenOf(ab, vertex.id).find((object) => object.type === 'Weight' || object.type === 'CubicWeight');
  if (!skin || !weight) return null;
  const tendons = childrenOf(ab, skin.id).filter((object) => object.type === 'Tendon');
  const effective = weight.type !== 'CubicWeight' || channel === 'all' ? 'point' : channel;
  const prefix = effective === 'point' ? '' : effective;
  const influences = unpackInfluences(
    Number(weight.props[prefix ? `${prefix}Indices` : 'indices'] ?? 0),
    Number(weight.props[prefix ? `${prefix}Values` : 'values'] ?? 0),
  ).filter((item) => item.weight > 0);
  const commit = (next: typeof influences) =>
    mutate((doc) => {
      setSkinWeights(doc, { artboard: ab.id, vertex: vertex.id, influences: next, channel: weight.type === 'CubicWeight' ? channel : 'point' });
    });
  return (
    <div className="section flex flex-col gap-2">
      <div className="panel-title">Bone weights</div>
      {weight.type === 'CubicWeight' && <ChannelSelect value={channel} disabled={readOnly} onChange={setChannel} />}
      {influences.map((influence, slot) => (
        <div className="flex flex-col gap-1" key={influence.index}>
          <select
            className="field h-7 min-w-0"
            aria-label={`Influence ${slot + 1} bone`}
            value={influence.index}
            disabled={readOnly}
            onChange={(event) => commit(influences.map((item, i) => (i === slot ? { ...item, index: Number(event.target.value) } : item)))}
          >
            <option value={0}>Unbound (identity)</option>
            {tendons.map((tendon, i) => (
              <option key={tendon.id} value={i + 1}>
                {name(ab.objects.find((bone) => bone.id === tendon.props.boneId) ?? tendon)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            <input
              className="flex-1 min-w-0"
              type="range"
              aria-label={`Influence ${slot + 1} weight`}
              min={0}
              max={100}
              value={Math.round(influence.weight * 100)}
              disabled={readOnly || (influences.length === 1 && influence.index === 0)}
              onPointerDown={() => useEditor.getState().beginGesture()}
              onPointerUp={() => useEditor.getState().endGesture()}
              onPointerCancel={() => useEditor.getState().endGesture()}
              onBlur={() => useEditor.getState().endGesture()}
              onChange={(event) => commit(adjustInfluence(influences, influence.index, Number(event.target.value) / 100))}
            />
            <span className="text-t2 tabular-nums">{Math.round(influence.weight * 100)}%</span>
          </label>
        </div>
      ))}
      {influences.length < 4 && (
        <select
          className="field h-7"
          aria-label="Add bone influence"
          disabled={readOnly}
          value=""
          onChange={(event) => commit(adjustInfluence(influences, Number(event.target.value), 0.25))}
        >
          <option value="" disabled>
            Add influence…
          </option>
          {!influences.some((influence) => influence.index === 0) && <option value={0}>Unbound (identity)</option>}
          {tendons
            .map((tendon, i) => ({ tendon, index: i + 1 }))
            .filter((item) => !influences.some((influence) => influence.index === item.index))
            .map(({ tendon, index }) => (
              <option key={tendon.id} value={index}>
                {name(ab.objects.find((bone) => bone.id === tendon.props.boneId) ?? tendon)}
              </option>
            ))}
        </select>
      )}
      <p className="text-[11px] leading-relaxed text-t2">Up to four influences, normalized to 100%. Cubic handles can be weighted independently.</p>
    </div>
  );
}
