'use client';
import { EASE_PRESETS } from '@openrive/rive/ops';
import { Modal } from '@openrive/ui';
import { usePrefs } from '@/lib/client/prefs';
import { ColorSwatch, NumberField, Row, Select } from './controls';

export function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs((s) => s.prefs);
  const update = usePrefs((s) => s.update);
  const reset = usePrefs((s) => s.reset);
  return (
    <Modal title="Preferences" onClose={onClose}>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="panel-title">New shapes</div>
            <Row label="Fill">
              <Select
                value={prefs.shapeFillMode}
                options={[
                  { value: 'palette', label: 'Cycle colors' },
                  { value: 'fixed', label: 'Always this color' },
                ]}
                onChange={(v) => update({ shapeFillMode: v })}
              />
            </Row>
            {prefs.shapeFillMode === 'fixed' && (
              <Row label="">
                <ColorSwatch value={prefs.shapeFill} onChange={(v) => update({ shapeFill: v })} />
              </Row>
            )}
            <Row label="Stroke">
              <input type="checkbox" checked={prefs.shapeStroke} onChange={(e) => update({ shapeStroke: e.target.checked })} />
              {prefs.shapeStroke && (
                <>
                  <ColorSwatch value={prefs.strokeColor} onChange={(v) => update({ strokeColor: v })} />
                  <div className="w-16">
                    <NumberField value={prefs.strokeWidth} min={0} onChange={(v) => update({ strokeWidth: v })} />
                  </div>
                </>
              )}
            </Row>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="panel-title">New text</div>
            <Row label="Color">
              <ColorSwatch value={prefs.textColor} onChange={(v) => update({ textColor: v })} />
            </Row>
            <Row label="Size">
              <NumberField value={prefs.textSize} min={1} onChange={(v) => update({ textSize: v })} />
            </Row>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="panel-title">Animation</div>
            <Row label="New keys">
              <Select
                value={prefs.keyInterpolation}
                options={[
                  { value: 'linear', label: 'Linear' },
                  { value: 'cubic', label: 'Eased' },
                  { value: 'hold', label: 'Hold' },
                ]}
                onChange={(v) => update({ keyInterpolation: v })}
              />
            </Row>
            {prefs.keyInterpolation === 'cubic' && (
              <Row label="Ease">
                <Select value={prefs.keyEase} options={Object.keys(EASE_PRESETS).map((k) => ({ value: k, label: k }))} onChange={(v) => update({ keyEase: v })} />
              </Row>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="panel-title">Selecting</div>
            <Row label="Click">
              <Select
                value={prefs.selectMode}
                options={[
                  { value: 'group', label: 'Selects the whole group' },
                  { value: 'object', label: 'Selects the object' },
                ]}
                onChange={(v) => update({ selectMode: v })}
              />
            </Row>
            <p className="text-t3 text-[11px]">Double-click a group to select inside it; Esc steps back out.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="panel-title">Moving</div>
            <Row label="Nudge">
              <NumberField value={prefs.nudge} min={0.01} onChange={(v) => update({ nudge: v })} suffix="px" />
              <NumberField value={prefs.bigNudge} min={0.01} onChange={(v) => update({ bigNudge: v })} suffix="px" />
            </Row>
            <label className="flex items-center gap-2 text-t1">
              <input type="checkbox" checked={prefs.snapToPixel} onChange={(e) => update({ snapToPixel: e.target.checked })} />
              Snap positions to whole pixels while dragging
            </label>
          </div>
        </div>
      <div className="flex justify-between p-4 border-t border-line">
        <button className="btn" onClick={reset}>
          Restore defaults
        </button>
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
