import React from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Type, X } from 'lucide-react';
import { GroundMark } from '../types';
import { fileToLogo } from '../utils/logos';

interface GroundMarkPanelProps {
  isOpen: boolean;
  mark: GroundMark;
  groundName: string;
  /** Field size in metres, for the position pad's shape */
  groundWidth: number;
  groundHeight: number;
  onChange: (mark: GroundMark) => void;
  onClose: () => void;
}

const MODES: { id: GroundMark['mode']; label: string }[] = [
  { id: 'name', label: 'Ground name' },
  { id: 'text', label: 'Your text' },
  { id: 'logo', label: 'Logo' },
  { id: 'none', label: 'Nothing' },
];

/** Choose what's painted on the ground (the ground name, your own text, a logo, or nothing) and where. */
/** A small picture of the field: click or drag to put the mark's centre anywhere. */
function PositionPad({ mark, aspect, label, onMove }: { mark: GroundMark; aspect: number; label: string; onMove: (x: number, y: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const setFrom = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    // Snap to the middle lines when close, so centring is easy
    onMove(Math.abs(x - 0.5) < 0.025 ? 0.5 : Number(x.toFixed(3)), Math.abs(y - 0.5) < 0.025 ? 0.5 : Number(y.toFixed(3)));
  };
  const x = mark.x ?? 0.5;
  const y = mark.y ?? 0.5;
  // Keep the pad a sensible size whatever the field's shape
  const w = aspect >= 1 ? 100 : Math.max(35, 100 * aspect);
  return (
    <div className="flex justify-center">
      <div
        ref={ref}
        role="slider"
        aria-label="Position on the field"
        aria-valuetext={`${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down`}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
          if (!d) return;
          e.preventDefault();
          onMove(Math.min(1, Math.max(0, x + d[0])), Math.min(1, Math.max(0, y + d[1])));
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setFrom(e);
        }}
        onPointerMove={(e) => dragging.current && setFrom(e)}
        onPointerUp={() => (dragging.current = false)}
        className="relative rounded-md border border-slate-600 bg-slate-950 cursor-crosshair touch-none select-none"
        style={{ width: `${w}%`, aspectRatio: `${aspect}` }}
      >
        {/* Centre lines */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-700/70" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700/70" />
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-sky-500/25 border border-sky-400 text-[9px] text-sky-100 whitespace-nowrap max-w-[90%] truncate pointer-events-none"
          style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: `translate(-50%, -50%) rotate(${mark.rotation ?? 0}deg)` }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export const GroundMarkPanel: React.FC<GroundMarkPanelProps> = ({ isOpen, mark, groundName, groundWidth, groundHeight, onChange, onClose }) => {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const isLogo = mark.mode === 'logo';
  const opacity = mark.opacity ?? (isLogo ? 0.6 : mark.mode === 'text' ? 0.4 : 0.1);
  const pickLogo = () => fileRef.current?.click();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-end compact:justify-center bg-black/10 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Ground marking"
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-tg-panel p-4 shadow-2xl font-mono text-xs text-slate-300"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Type className="w-4 h-4 text-sky-400" /> Ground marking
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-slate-500 mb-3">Painted on the field wherever you place it, in 2D, 3D and exports. Saved with the track.</p>

        <div role="radiogroup" aria-label="What to paint" className="grid grid-cols-4 gap-1 mb-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mark.mode === m.id}
              onClick={() => {
                setError(null);
                if (m.id === 'logo' && !mark.logo) {
                  pickLogo();
                  return;
                }
                onChange({ ...mark, mode: m.id, opacity: undefined }); // keeps its position, size and turn
              }}
              className={`px-1.5 py-2 rounded-lg border text-[11px] transition ${
                mark.mode === m.id ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mark.mode === 'name' && <p className="mb-3 text-slate-400">Shows “{groundName}”.</p>}

        {mark.mode === 'text' && (
          <label className="block mb-3">
            <span className="block text-slate-400 mb-1">Text (for example the track name)</span>
            <input
              autoFocus
              value={mark.text ?? ''}
              maxLength={60}
              placeholder="UAE FPV Cup 2026"
              onChange={(e) => onChange({ ...mark, text: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:outline-hidden focus:border-sky-400"
            />
          </label>
        )}

        {isLogo && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-16 h-16 rounded border border-slate-700 bg-slate-950 flex items-center justify-center overflow-hidden">
              {mark.logo ? <img src={mark.logo} alt="" className="max-w-full max-h-full object-contain" /> : <ImagePlus className="w-5 h-5 text-slate-600" />}
            </div>
            <button onClick={pickLogo} className="px-3 py-1.5 rounded border border-slate-700 text-sky-300 hover:border-sky-500/60">
              Change logo
            </button>
          </div>
        )}

        {mark.mode !== 'none' && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span>Position (click or drag)</span>
              <button
                type="button"
                onClick={() => onChange({ ...mark, x: undefined, y: undefined })}
                className="text-[11px] text-sky-300 hover:text-sky-200"
              >
                Centre
              </button>
            </div>
            <PositionPad
              mark={mark}
              aspect={groundWidth / Math.max(1, groundHeight)}
              label={isLogo ? 'Logo' : (mark.mode === 'text' ? mark.text : groundName)?.trim() || 'Text'}
              onMove={(x, y) => onChange({ ...mark, x, y })}
            />
            <label className="block">
              <span className="flex justify-between text-slate-400 mb-1">
                <span>Size</span>
                <span className="text-sky-300">{Math.round((mark.scale ?? 1) * 100)}%</span>
              </span>
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.05}
                value={mark.scale ?? 1}
                onChange={(e) => onChange({ ...mark, scale: Number(e.target.value) })}
                aria-label="Ground marking size"
                className="w-full accent-sky-400"
              />
            </label>
            <label className="block">
              <span className="flex justify-between text-slate-400 mb-1">
                <span>Rotation</span>
                <span className="text-sky-300">{Math.round(mark.rotation ?? 0)}°</span>
              </span>
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={mark.rotation ?? 0}
                onChange={(e) => onChange({ ...mark, rotation: Number(e.target.value) })}
                onDoubleClick={() => onChange({ ...mark, rotation: 0 })}
                aria-label="Ground marking rotation"
                className="w-full accent-sky-400"
              />
            </label>
          </div>
        )}

        {mark.mode !== 'none' && (
          <label className="block">
            <span className="flex justify-between text-slate-400 mb-1">
              <span>Strength</span>
              <span className="text-sky-300">{Math.round(opacity * 100)}%</span>
            </span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => onChange({ ...mark, opacity: Number(e.target.value) })}
              aria-label="Ground marking strength"
              className="w-full accent-sky-400"
            />
          </label>
        )}

        {error && <p className="mt-2 text-red-300">{error}</p>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Ground logo file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setError(null);
              onChange({ ...mark, mode: 'logo', logo: await fileToLogo(file), opacity: undefined });
            } catch (err) {
              setError(String((err as Error)?.message ?? err));
            }
          }}
        />
      </div>
    </div>,
    document.body
  );
};
