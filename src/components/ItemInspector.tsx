import React from 'react';
import {
  RotateCw,
  RotateCcw,
  Trash2,
  Copy,
  Hash,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  X,
  Compass,
  FlipHorizontal,
  Navigation,
  Layers,
  Move,
  Lock,
  Unlock,
} from 'lucide-react';
import { PlacedItem, MANEUVER_OPTIONS } from '../types';
import { EQUIPMENT_MAP, FIELD_HEIGHT_M, FIELD_WIDTH_M } from '../constants/equipment';
import { isInsideFence } from '../utils/trackMath';

interface ItemInspectorProps {
  item: PlacedItem | null;
  onUpdateItem: (id: string, updates: Partial<PlacedItem>) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (item: PlacedItem) => void;
  onClose: () => void;
  maxSequence: number;
  canDuplicate: boolean;
}

export const ItemInspector: React.FC<ItemInspectorProps> = ({
  item,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  onClose,
  maxSequence,
  canDuplicate,
}) => {
  if (!item) return null;

  const equip = EQUIPMENT_MAP.get(item.equipId);
  if (!equip) return null;

  const insideSafeZone = isInsideFence(item.x, item.y);

  const rotate = (deltaDeg: number) => {
    let next = (item.rotation + deltaDeg) % 360;
    if (next < 0) next += 360;
    onUpdateItem(item.id, { rotation: next });
  };

  const setExactAngle = (angle: number) => {
    let next = angle % 360;
    if (next < 0) next += 360;
    onUpdateItem(item.id, { rotation: next });
  };

  const handleSequenceChange = (newSeq: number | null) => {
    onUpdateItem(item.id, { sequenceOrder: newSeq });
  };

  return (
    <div
      id="item-inspector-panel"
      className="absolute bottom-14 right-4 z-20 w-80 max-h-[calc(100%-4.5rem)] compact:left-2 compact:right-2 compact:w-auto compact:bottom-14 compact:max-h-[48%] overflow-y-auto bg-tg-panel/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3.5 shadow-2xl text-xs font-mono text-slate-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: equip.color }}
          />
          <div>
            <h4 className="font-bold text-slate-100 truncate">{equip.name}</h4>
            <span className="text-[10px] text-slate-400">
              {equip.width}m × {equip.depth}m · {equip.heightDesc}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            id="btn-lock-item"
            onClick={() => onUpdateItem(item.id, { locked: !item.locked })}
            className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold transition ${
              item.locked
                ? 'bg-amber-400/15 border-amber-400/70 text-amber-200'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
            title={item.locked ? 'Unlock so it can be moved again (L)' : 'Lock in place so it can’t be moved by mistake (L)'}
          >
            {item.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {item.locked ? 'Locked' : 'Lock'}
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded"
            title="Deselect"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {item.locked && (
        <div className="mt-2.5 p-2 rounded bg-amber-950/40 border border-amber-500/40 text-amber-200 flex items-center gap-2 text-[10px]">
          <Lock className="w-3.5 h-3.5 shrink-0 text-amber-300" />
          <span>Locked in place: position, heading, tilt and delete are off. Unlock to change them.</span>
        </div>
      )}

      {/* Safety Buffer Warning */}
      {!insideSafeZone && (
        <div className="mt-2.5 p-2 rounded bg-amber-950/60 border border-amber-500/50 text-amber-300 flex items-center gap-2 text-[10px]">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Item is inside the 3m perimeter fence buffer zone!</span>
        </div>
      )}

      {/* Everything that moves or turns the piece is switched off while it's locked */}
      <fieldset disabled={!!item.locked} className={`m-0 p-0 border-0 min-w-0 ${item.locked ? 'opacity-40 pointer-events-none select-none' : ''}`}>
      {/* Coordinates & Positioning */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="bg-slate-900 p-2 rounded border border-slate-800">
          <label className="text-[10px] text-slate-400 block mb-1">X Position</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="0.5"
              min="0.5"
              max={FIELD_WIDTH_M - 0.5}
              value={Number(item.x.toFixed(1))}
              onChange={(e) => onUpdateItem(item.id, { x: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-sky-300 text-xs font-mono"
            />
            <span className="text-slate-500 text-[10px]">m</span>
          </div>
        </div>

        <div className="bg-slate-900 p-2 rounded border border-slate-800">
          <label className="text-[10px] text-slate-400 block mb-1">Y Position</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="0.5"
              min="0.5"
              max={FIELD_HEIGHT_M - 0.5}
              value={Number(item.y.toFixed(1))}
              onChange={(e) => onUpdateItem(item.id, { y: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-sky-300 text-xs font-mono"
            />
            <span className="text-slate-500 text-[10px]">m</span>
          </div>
        </div>
      </div>

      {/* Gate Yaw Rotation (Orientation / Heading) */}
      <div className="mt-2.5 bg-slate-900 p-2.5 rounded border border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            Gate Yaw (Heading)
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="359"
              value={Math.round(item.rotation)}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val)) {
                  setExactAngle(((val % 360) + 360) % 360);
                }
              }}
              className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-amber-300 focus:outline-hidden focus:border-amber-400"
            />
            <span className="text-slate-400 text-xs font-mono">°</span>
          </div>
        </div>

        {/* Interactive Circular Compass Dial */}
        <div className="flex items-center justify-center py-1 mb-2">
          <div
            className="relative w-28 h-28 rounded-full bg-slate-950 border-2 border-slate-700 cursor-crosshair flex items-center justify-center select-none shadow-inner"
            title="Click or drag around the dial to set Gate Yaw heading"
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const handlePointerMove = (me: PointerEvent) => {
                const dx = me.clientX - centerX;
                const dy = me.clientY - centerY;
                let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90);
                if (deg < 0) deg += 360;
                deg = deg >= 360 ? 0 : deg;
                setExactAngle(deg);
              };
              handlePointerMove(e.nativeEvent);
              const handlePointerUp = () => {
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
              };
              window.addEventListener('pointermove', handlePointerMove);
              window.addEventListener('pointerup', handlePointerUp);
            }}
          >
            {/* Cardinal Markers */}
            <span className="absolute top-1 text-[9px] font-mono font-bold text-rose-400 pointer-events-none">N 0°</span>
            <span className="absolute right-1 text-[9px] font-mono text-slate-500 pointer-events-none">E 90°</span>
            <span className="absolute bottom-1 text-[9px] font-mono text-slate-500 pointer-events-none">S 180°</span>
            <span className="absolute left-1 text-[9px] font-mono text-slate-500 pointer-events-none">W 270°</span>

            {/* Dial Needle / Pointer */}
            <div
              className="absolute w-full h-full pointer-events-none transition-transform duration-75 flex items-center justify-center"
              style={{ transform: `rotate(${item.rotation}deg)` }}
            >
              {/* Arrow pointer toward facing direction (0 is top) */}
              <div className="absolute top-2 w-1.5 h-10 bg-gradient-to-t from-transparent via-amber-400 to-amber-300 rounded-t-full shadow-sm shadow-amber-400" />
              <div className="absolute -top-1 w-0 h-0 border-x-4 border-x-transparent border-b-8 border-b-amber-400" />
              {/* Center pivot dot */}
              <div className="w-4 h-4 rounded-full bg-slate-900 border-2 border-amber-400 z-10 flex items-center justify-center shadow-md">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Yaw Angle Slider */}
        <div className="space-y-1 mb-2">
          <input
            type="range"
            min="0"
            max="359"
            step="1"
            value={Math.round(item.rotation)}
            onChange={(e) => setExactAngle(Number(e.target.value))}
            className="w-full accent-amber-400 bg-slate-800 h-1.5 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
            <span>0° (N)</span>
            <span>90° (E)</span>
            <span>180° (S)</span>
            <span>270° (W)</span>
            <span>360°</span>
          </div>
        </div>

        {/* Fine & Medium Step Buttons */}
        <div className="grid grid-cols-6 gap-1 mb-2">
          <button
            onClick={() => rotate(-45)}
            className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] transition text-center"
            title="Rotate -45°"
          >
            -45°
          </button>
          <button
            id="btn-rotate-ccw-15"
            onClick={() => rotate(-15)}
            className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold border border-slate-700 text-[10px] transition text-center"
            title="Rotate -15° (Shift+R)"
          >
            ↺ -15°
          </button>
          <button
            onClick={() => rotate(-5)}
            className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] transition text-center"
            title="Fine Rotate -5°"
          >
            -5°
          </button>
          <button
            onClick={() => rotate(5)}
            className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] transition text-center"
            title="Fine Rotate +5°"
          >
            +5°
          </button>
          <button
            id="btn-rotate-cw-15"
            onClick={() => rotate(15)}
            className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold border border-slate-700 text-[10px] transition text-center"
            title="Rotate +15° (R)"
          >
            +15° ↻
          </button>
          <button
            onClick={() => rotate(45)}
            className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] transition text-center"
            title="Rotate +45°"
          >
            +45°
          </button>
        </div>

        {/* Cardinal Direction Presets & Invert */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => rotate(180)}
            className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] transition text-center flex items-center justify-center gap-1"
            title="Invert 180°"
          >
            <RotateCw className="w-2.5 h-2.5 text-amber-400" />
            Flip 180°
          </button>
          {[
            { label: '0° N', angle: 0 },
            { label: '45°', angle: 45 },
            { label: '90° E', angle: 90 },
            { label: '135°', angle: 135 },
            { label: '180° S', angle: 180 },
            { label: '270° W', angle: 270 },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => setExactAngle(preset.angle)}
              className={`px-1.5 py-1 rounded border text-[9px] transition ${
                Math.round(item.rotation) === preset.angle
                  ? 'bg-amber-500/25 border-amber-400 text-amber-300 font-bold'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Gate Pitch Rotation (Tilt Forward / Backward) */}
        <div className="mt-3 pt-2.5 border-t border-slate-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
              <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
              Gate Pitch (Tilt Forward/Back)
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="-85"
                max="85"
                value={Math.round(item.pitch ?? 0)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) {
                    onUpdateItem(item.id, { pitch: Math.max(-85, Math.min(85, Math.round(val))) });
                  }
                }}
                className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-emerald-300 focus:outline-hidden focus:border-emerald-400"
              />
              <span className="text-slate-400 text-xs font-mono">°</span>
            </div>
          </div>

          {/* Pitch Slider */}
          <div className="space-y-1 mb-2">
            <input
              type="range"
              min="-85"
              max="85"
              step="5"
              value={Math.round(item.pitch ?? 0)}
              onChange={(e) => onUpdateItem(item.id, { pitch: Number(e.target.value) })}
              className="w-full accent-emerald-400 bg-slate-800 h-1.5 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
              <span>-85° (Back)</span>
              <span>-45°</span>
              <span className="text-emerald-400 font-bold">0° Flat</span>
              <span>+45°</span>
              <span>+85° (Fwd)</span>
            </div>
          </div>

          {/* Quick Pitch Presets */}
          <div className="grid grid-cols-5 gap-1">
            {[
              { label: '-45°', val: -45 },
              { label: '-15°', val: -15 },
              { label: '0° Flat', val: 0 },
              { label: '+15°', val: 15 },
              { label: '+45°', val: 45 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => onUpdateItem(item.id, { pitch: p.val })}
                className={`py-1 rounded text-[10px] border transition text-center ${
                  Math.round(item.pitch ?? 0) === p.val
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 font-bold'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 border-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Gate Roll Rotation (Bank / Lean Left/Right) */}
        <div className="mt-3 pt-2.5 border-t border-slate-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5">
              <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
              Gate Roll (Bank / Lean)
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="-180"
                max="180"
                value={Math.round(item.roll ?? 0)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) {
                    onUpdateItem(item.id, { roll: Math.max(-180, Math.min(180, Math.round(val))) });
                  }
                }}
                className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-cyan-300 focus:outline-hidden focus:border-cyan-400"
              />
              <span className="text-slate-400 text-xs font-mono">°</span>
            </div>
          </div>

          {/* Roll Slider */}
          <div className="space-y-1 mb-2">
            <input
              type="range"
              min="-180"
              max="180"
              step="5"
              value={Math.round(item.roll ?? 0)}
              onChange={(e) => onUpdateItem(item.id, { roll: Number(e.target.value) })}
              className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
              <span>-180°</span>
              <span>-45° (L)</span>
              <span className="text-cyan-400 font-bold">0° Upright</span>
              <span>+45° (R)</span>
              <span>+180°</span>
            </div>
          </div>

          {/* Quick Roll Presets */}
          <div className="grid grid-cols-5 gap-1">
            {[
              { label: '-90° L', val: -90 },
              { label: '-45°', val: -45 },
              { label: '0° Up', val: 0 },
              { label: '+45°', val: 45 },
              { label: '+90° R', val: 90 },
            ].map((r) => (
              <button
                key={r.label}
                onClick={() => onUpdateItem(item.id, { roll: r.val })}
                className={`py-1 rounded text-[10px] border transition text-center ${
                  Math.round(item.roll ?? 0) === r.val
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 font-bold'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 border-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Reset Pitch & Roll Button if altered */}
          {((item.pitch ?? 0) !== 0 || (item.roll ?? 0) !== 0) && (
            <div className="mt-2 text-right">
              <button
                onClick={() => onUpdateItem(item.id, { pitch: 0, roll: 0 })}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] transition inline-flex items-center gap-1"
                title="Reset pitch and roll to 0°"
              >
                <RotateCcw className="w-2.5 h-2.5 text-slate-400" />
                Reset Pitch & Roll (0°)
              </button>
            </div>
          )}
        </div>

        {/* Mirror (Flip Horizontal) */}
        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <FlipHorizontal className="w-3 h-3 text-sky-400" />
            Orientation Mirror
          </span>
          <button
            id="btn-mirror-gate"
            onClick={() => onUpdateItem(item.id, { isMirrored: !item.isMirrored })}
            className={`px-2.5 py-1 rounded border text-[11px] font-mono flex items-center gap-1.5 transition ${
              item.isMirrored
                ? 'bg-sky-500/25 border-sky-400 text-sky-300 font-bold shadow-sm shadow-sky-500/20'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
            title="Mirror / flip the gate horizontally (Shortcut: M)"
          >
            <FlipHorizontal className="w-3 h-3" />
            {item.isMirrored ? 'Mirrored (Flipped)' : 'Mirror Gate'}
          </button>
        </div>
      </div>

      </fieldset>

      {/* Flight Maneuver & Entry/Exit Selector */}
      <div className="mt-2.5 bg-slate-900 p-2.5 rounded border border-slate-800">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Navigation className="w-3 h-3 text-amber-400" />
            Flight Maneuver / Entry & Exit
          </span>
          {item.maneuver && item.maneuver !== 'straight' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold">
              Active
            </span>
          )}
        </div>
        <select
          id="select-gate-maneuver"
          value={item.maneuver || 'straight'}
          onChange={(e) => onUpdateItem(item.id, { maneuver: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-400 cursor-pointer"
        >
          {MANEUVER_OPTIONS.map((m) => (
            <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
              {m.iconSymbol} {m.label}
            </option>
          ))}
        </select>

        {/* Maneuver Badge Manual Move / Nudge Controls */}
        {item.maneuver && item.maneuver !== 'straight' && (
          <div className="mt-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                <Move className="w-3 h-3 text-amber-400" />
                Badge Position (Drag or Nudge)
              </span>
              {(item.maneuverOffsetX !== undefined || item.maneuverOffsetY !== undefined || item.maneuverRotation !== undefined) && (
                <button
                  id="btn-reset-badge-pos"
                  onClick={() => onUpdateItem(item.id, { maneuverOffsetX: undefined, maneuverOffsetY: undefined, maneuverRotation: undefined })}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-0.5 transition"
                  title="Reset badge position and rotation to default"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Reset
                </button>
              )}
            </div>

            {/* Horizontal & Vertical Nudge Controls */}
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
              {/* Horizontal / X */}
              <div className="bg-slate-950 p-1.5 rounded border border-slate-800 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Horizontal (X)</span>
                  <span className="text-amber-300 font-bold">
                    {item.maneuverOffsetX !== undefined
                      ? `${item.maneuverOffsetX > 0 ? '+' : ''}${item.maneuverOffsetX.toFixed(1)}m`
                      : 'Auto'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    id="btn-nudge-maneuver-left"
                    onClick={() => {
                      const cur = item.maneuverOffsetX ?? 1.8;
                      onUpdateItem(item.id, { maneuverOffsetX: Number((cur - 0.5).toFixed(1)) });
                    }}
                    className="flex-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-center text-slate-200 border border-slate-700 hover:text-amber-300 transition"
                    title="Move Left 0.5m"
                  >
                    ◀ -0.5m
                  </button>
                  <button
                    id="btn-nudge-maneuver-right"
                    onClick={() => {
                      const cur = item.maneuverOffsetX ?? 1.8;
                      onUpdateItem(item.id, { maneuverOffsetX: Number((cur + 0.5).toFixed(1)) });
                    }}
                    className="flex-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-center text-slate-200 border border-slate-700 hover:text-amber-300 transition"
                    title="Move Right 0.5m"
                  >
                    +0.5m ▶
                  </button>
                </div>
              </div>

              {/* Vertical / Y */}
              <div className="bg-slate-950 p-1.5 rounded border border-slate-800 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Vertical (Y)</span>
                  <span className="text-amber-300 font-bold">
                    {item.maneuverOffsetY !== undefined
                      ? `${item.maneuverOffsetY > 0 ? '+' : ''}${item.maneuverOffsetY.toFixed(1)}m`
                      : 'Auto'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    id="btn-nudge-maneuver-up"
                    onClick={() => {
                      const cur = item.maneuverOffsetY ?? 0;
                      onUpdateItem(item.id, { maneuverOffsetY: Number((cur - 0.5).toFixed(1)) });
                    }}
                    className="flex-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-center text-slate-200 border border-slate-700 hover:text-amber-300 transition"
                    title="Move Up 0.5m"
                  >
                    ▲ -0.5m
                  </button>
                  <button
                    id="btn-nudge-maneuver-down"
                    onClick={() => {
                      const cur = item.maneuverOffsetY ?? 0;
                      onUpdateItem(item.id, { maneuverOffsetY: Number((cur + 0.5).toFixed(1)) });
                    }}
                    className="flex-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-center text-slate-200 border border-slate-700 hover:text-amber-300 transition"
                    title="Move Down 0.5m"
                  >
                    +0.5m ▼
                  </button>
                </div>
              </div>
            </div>

            {/* Maneuver Rotation Controls */}
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800 flex flex-col gap-1 mt-1 text-[11px] font-mono">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Compass className="w-2.5 h-2.5 text-amber-400" />
                  Maneuver Rotation
                </span>
                <span className="text-amber-300 font-bold">
                  {item.maneuverRotation ?? 0}°
                </span>
              </div>
              {/* Step buttons & quick angles */}
              <div className="flex items-center gap-1">
                <button
                  id="btn-rotate-maneuver-ccw"
                  onClick={() => {
                    const cur = item.maneuverRotation ?? 0;
                    const next = (cur - 15 + 360) % 360;
                    onUpdateItem(item.id, { maneuverRotation: next });
                  }}
                  className="flex-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-center text-slate-200 border border-slate-700 hover:text-amber-300 transition"
                  title="Rotate -15°"
                >
                  ↺ -15°
                </button>
                <button
                  id="btn-rotate-maneuver-cw"
                  onClick={() => {
                    const cur = item.maneuverRotation ?? 0;
                    const next = (cur + 15) % 360;
                    onUpdateItem(item.id, { maneuverRotation: next });
                  }}
                  className="flex-1 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-center text-slate-200 border border-slate-700 hover:text-amber-300 transition"
                  title="Rotate +15°"
                >
                  +15° ↻
                </button>
                <button
                  id="btn-maneuver-rot-0"
                  onClick={() => onUpdateItem(item.id, { maneuverRotation: 0 })}
                  className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
                    (item.maneuverRotation ?? 0) === 0
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                  title="0° Horizontal"
                >
                  0°
                </button>
                <button
                  id="btn-maneuver-rot-90"
                  onClick={() => onUpdateItem(item.id, { maneuverRotation: 90 })}
                  className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
                    item.maneuverRotation === 90
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                  title="90° Vertical"
                >
                  90°
                </button>
                <button
                  id="btn-maneuver-rot-180"
                  onClick={() => onUpdateItem(item.id, { maneuverRotation: 180 })}
                  className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
                    item.maneuverRotation === 180
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                  title="180° Inverted"
                >
                  180°
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
              💡 Drag badge body to move horizontally/vertically, or grab the yellow rotation knob at the top on canvas to rotate freely.
            </p>
          </div>
        )}

        {/* Multi-Tier Gate Height Selector (if vertical quad, vertical triple, or double cube) */}
        {['vertical_quad', 'vertical_triple', 'vertical_double', 'double_cube'].includes(equip.visualType) && (
          <div className="mt-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-purple-300 flex items-center gap-1 font-semibold">
                <Layers className="w-3 h-3 text-purple-400" />
                Target Gate Tier
              </span>
              <span className="text-[9px] text-purple-400">
                {equip.visualType === 'vertical_quad'
                  ? '4 Tiers (8m)'
                  : equip.visualType === 'vertical_triple' || equip.visualType === 'vertical_double'
                  ? '3 Tiers (6m)'
                  : '2 Cubes (4m)'}
              </span>
            </div>
            <select
              id="select-target-tier"
              value={item.targetTier || 'all'}
              onChange={(e) => onUpdateItem(item.id, { targetTier: e.target.value })}
              className="w-full bg-slate-950 border border-purple-800/80 rounded px-2 py-1 text-[11px] text-purple-300 font-mono focus:outline-none focus:border-purple-400 cursor-pointer"
            >
              {equip.visualType === 'vertical_quad' ? (
                <>
                  <option value="all">All 4 Tiers Stacked (0-8m)</option>
                  <option value="tier1">Gate 1: Bottom 2×2m (0m - 2m)</option>
                  <option value="tier2">Gate 2: Lower-Mid 2×2m (2m - 4m)</option>
                  <option value="tier3">Gate 3: Upper-Mid 2×2m (4m - 6m)</option>
                  <option value="tier4">Gate 4: Top 2×2m (6m - 8m)</option>
                  <option value="ladder_up">Ladder Up: Gate 1 ➔ 2 ➔ 3 ➔ 4</option>
                  <option value="ladder_down">Ladder Down: Gate 4 ➔ 3 ➔ 2 ➔ 1</option>
                </>
              ) : equip.visualType === 'vertical_triple' || equip.visualType === 'vertical_double' ? (
                <>
                  <option value="all">All 3 Tiers Stacked (0-6m)</option>
                  <option value="tier1">Gate 1: Bottom 2×2m (0m - 2m)</option>
                  <option value="tier2">Gate 2: Middle 2×2m (2m - 4m)</option>
                  <option value="tier3">Gate 3: Top 2×2m (4m - 6m)</option>
                  <option value="ladder_up">Ladder Up: Gate 1 ➔ 2 ➔ 3</option>
                  <option value="ladder_down">Ladder Down: Gate 3 ➔ 2 ➔ 1</option>
                </>
              ) : (
                <>
                  <option value="all">Both 2×2m Cubes Stacked (0-4m)</option>
                  <option value="cube2_dive">Top Cube Dive-In (2m - 4m)</option>
                  <option value="cube1_exit">Bottom Cube Ground Exit (0m - 2m)</option>
                </>
              )}
            </select>
          </div>
        )}
      </div>

      {/* Flight Path Waypoint Order */}
      <div className="mt-2.5 bg-slate-900 p-2 rounded border border-slate-800">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Hash className="w-3 h-3 text-cyan-400" />
            Flight Path Order
          </span>
          <span className="text-cyan-300 font-bold">
            {item.sequenceOrder !== null
              ? item.sequenceOrder === 1
                ? 'Waypoint #1 (START)'
                : `Waypoint #${item.sequenceOrder}`
              : 'Unassigned'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {item.sequenceOrder !== null ? (
            <>
              <button
                onClick={() =>
                  handleSequenceChange(
                    item.sequenceOrder! > 1 ? item.sequenceOrder! - 1 : item.sequenceOrder
                  )
                }
                disabled={item.sequenceOrder <= 1}
                className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 flex items-center justify-center gap-1 text-[11px]"
                title="Move earlier in path"
              >
                <ArrowUp className="w-3 h-3" />
                Earlier
              </button>
              <button
                onClick={() => handleSequenceChange(item.sequenceOrder! + 1)}
                className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center gap-1 text-[11px]"
                title="Move later in path"
              >
                <ArrowDown className="w-3 h-3" />
                Later
              </button>
              <button
                onClick={() => handleSequenceChange(null)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-950/60 border border-slate-700 text-rose-300 text-[10px]"
                title="Exclude from flight path"
              >
                Unlink
              </button>
            </>
          ) : (
            <button
              onClick={() => handleSequenceChange(maxSequence + 1)}
              className="w-full py-1 rounded bg-cyan-950 border border-cyan-500/50 hover:bg-cyan-900 text-cyan-300 text-xs flex items-center justify-center gap-1.5 font-semibold"
            >
              Add as Waypoint #{maxSequence + 1}
            </button>
          )}
        </div>
      </div>

      {/* Action Buttons: Duplicate & Delete */}
      <div className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-800">
        <button
          id="btn-duplicate-item"
          disabled={!canDuplicate}
          onClick={() => onDuplicateItem(item)}
          className="flex-1 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 text-xs font-mono flex items-center justify-center gap-1.5 transition"
          title={canDuplicate ? 'Duplicate this gate' : 'No remaining inventory for this gate'}
        >
          <Copy className="w-3.5 h-3.5" />
          Duplicate
        </button>

        <button
          id="btn-delete-selected-item"
          disabled={!!item.locked}
          onClick={() => onDeleteItem(item.id)}
          className="py-1.5 px-3 rounded bg-rose-950/50 hover:bg-rose-900/80 border border-rose-800 text-rose-300 text-xs font-mono flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:pointer-events-none"
          title={item.locked ? 'Unlock to delete' : 'Delete item and return to inventory stock (Del)'}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
};
