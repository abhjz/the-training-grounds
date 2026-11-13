import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackagePlus, X } from 'lucide-react';
import { CUSTOM_COLORS, CUSTOM_SHAPES, CustomEquipmentInput, CustomShape } from '../utils/customEquipment';

const MIN = 0.3;
const MAX_W = 12;
const MAX_H = 10;

/** Front view of the piece at its real proportions. */
function ShapePreview({ shape, width, height, color }: { shape: CustomShape; width: number; height: number; color: string }) {
  const info = CUSTOM_SHAPES[shape];
  const w = Number.isFinite(width) && width > 0 ? width : info.defaultWidth;
  const h = Number.isFinite(height) && height > 0 ? height : info.defaultHeight;
  const total = h * info.tiers + (shape === 'gate_pole' ? 1 : 0);
  const box = 120;
  const pad = 10;
  const scale = Math.min((box - pad * 2) / Math.max(w, 0.9), (box - pad * 2) / total);
  const cx = box / 2;
  const ground = box - pad;
  const sw = 3;
  const frames = [];
  if (shape === 'flag') {
    const ph = h * scale;
    frames.push(<line key="p" x1={cx} y1={ground} x2={cx} y2={ground - ph} stroke="#e2e8f0" strokeWidth={sw} />);
    const bh = Math.min(1.6, h * 0.55) * scale;
    frames.push(<rect key="f" x={cx} y={ground - ph + 2} width={0.7 * scale} height={bh} fill={color} opacity={0.85} />);
  } else {
    for (let i = 0; i < info.tiers; i++) {
      const y = ground - (i + 1) * h * scale;
      frames.push(
        <rect
          key={i}
          x={cx - (w * scale) / 2}
          y={y}
          width={w * scale}
          height={h * scale}
          fill="none"
          stroke={color}
          strokeWidth={sw}
        />
      );
    }
    if (shape === 'gate_pole') {
      const x = cx - (w * scale) / 2;
      frames.push(<line key="pole" x1={x} y1={ground - h * scale} x2={x} y2={ground - (h + 1) * scale} stroke={color} strokeWidth={sw} />);
    }
  }
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden>
      <line x1={0} y1={ground} x2={box} y2={ground} stroke="#334155" strokeWidth={1} />
      {frames}
    </svg>
  );
}

export function EquipmentCreator({
  existingNames,
  onCancel,
  onCreate,
}: {
  existingNames: string[];
  onCancel: () => void;
  onCreate: (input: CustomEquipmentInput) => void;
}) {
  const [name, setName] = useState('');
  const [shape, setShape] = useState<CustomShape>('gate');
  const [width, setWidth] = useState(String(CUSTOM_SHAPES.gate.defaultWidth));
  const [height, setHeight] = useState(String(CUSTOM_SHAPES.gate.defaultHeight));
  const [color, setColor] = useState(CUSTOM_COLORS[0]);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const info = CUSTOM_SHAPES[shape];
  const w = Number(width);
  const h = Number(height);
  const trimmed = name.trim();
  const error = !trimmed
    ? 'Give the item a name'
    : existingNames.includes(trimmed.toLowerCase())
    ? 'An item with this name already exists'
    : !(w >= MIN && w <= MAX_W)
    ? `Width must be ${MIN}–${MAX_W} m`
    : !(h >= MIN && h <= MAX_H)
    ? `${info.heightLabel} must be ${MIN}–${MAX_H} m`
    : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const pickShape = (s: CustomShape) => {
    setShape(s);
    setWidth(String(CUSTOM_SHAPES[s].defaultWidth));
    setHeight(String(CUSTOM_SHAPES[s].defaultHeight));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    onCreate({ name: trimmed, shape, width: Math.round(w * 100) / 100, height: Math.round(h * 100) / 100, color, note });
  };

  const total = h * info.tiers;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-[#090d16] border border-slate-700 rounded-2xl shadow-2xl p-5 font-mono text-xs text-slate-300 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 uppercase tracking-wider">
            <PackagePlus className="w-4 h-4 text-emerald-300" /> New equipment
          </h2>
          <button type="button" onClick={onCancel} className="p-1 rounded text-slate-500 hover:text-slate-200" title="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-slate-400">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 3m Hurdle Gate"
            maxLength={40}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-slate-400">Shape</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(CUSTOM_SHAPES) as CustomShape[]).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => pickShape(s)}
                className={`px-2.5 py-1.5 rounded-lg border text-left transition ${
                  shape === s ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                {CUSTOM_SHAPES[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-slate-400">Width (m)</span>
              <input
                type="number"
                inputMode="decimal"
                min={MIN}
                max={MAX_W}
                step={0.1}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-slate-400">{info.heightLabel} (m)</span>
              <input
                type="number"
                inputMode="decimal"
                min={MIN}
                max={MAX_H}
                step={0.1}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </label>
            {info.tiers > 1 && Number.isFinite(total) && (
              <p className="text-slate-500">Total height {total.toFixed(1)} m</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1">
            <div className="rounded-lg border border-slate-800 bg-slate-950">
              <ShapePreview shape={shape} width={w} height={h} color={color} />
            </div>
            <span className="text-[10px] text-slate-500">Front view</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-slate-400">Colour</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {CUSTOM_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            <label className="w-6 h-6 rounded-full border border-dashed border-slate-500 overflow-hidden cursor-pointer" title="Pick any colour">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-10 -m-2 cursor-pointer"
              />
            </label>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-slate-400">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Shown under the name in the inventory"
            maxLength={80}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </label>

        {touched && error && <p className="text-rose-300">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/30 font-bold"
          >
            Add to inventory
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
