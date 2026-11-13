import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MapPinned, Plus, Trash2, X } from 'lucide-react';
import { DEFAULT_GROUND, Ground, MAX_GROUND_M, MIN_GROUND_M } from '../utils/grounds';

interface GroundSwitcherProps {
  grounds: Ground[];
  activeGround: Ground;
  onSwitch: (ground: Ground) => void;
  onCreate: (name: string, width: number, height: number) => void;
  onDelete: (id: string) => void;
}

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** Header title that opens a list of grounds, with "Create new ground". */
export const GroundSwitcher: React.FC<GroundSwitcherProps> = ({ grounds, activeGround, onSwitch, onCreate, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the list when clicking elsewhere or pressing Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDeleteId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group w-full text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-slate-800/60 transition"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch ground or create a new one"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-bold tracking-wider text-slate-100 uppercase font-mono truncate">
            {activeGround.name}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-sky-300 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
        <span className="block text-[11px] text-sky-400 font-mono">
          FPV Track Designer · {fmt(activeGround.width)}m × {fmt(activeGround.height)}m
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-2 z-50 w-72 bg-tg-panel border border-slate-700 rounded-xl shadow-2xl p-1.5 font-mono text-xs"
        >
          <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Grounds</div>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {grounds.map((g) => {
              const isActive = g.id === activeGround.id;
              const canDelete = !isActive && g.id !== DEFAULT_GROUND.id;
              return (
                <div
                  key={g.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                    isActive ? 'bg-sky-500/15 text-sky-200' : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <button
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onSwitch(g);
                      setOpen(false);
                    }}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left"
                  >
                    <span className="w-3.5 shrink-0">{isActive && <Check className="w-3.5 h-3.5 text-sky-300" />}</span>
                    <span className="truncate">{g.name}</span>
                    <span className="ml-auto shrink-0 text-slate-500">
                      {fmt(g.width)}×{fmt(g.height)}m
                    </span>
                  </button>
                  {canDelete &&
                    (confirmDeleteId === g.id ? (
                      <button
                        onClick={() => {
                          onDelete(g.id);
                          setConfirmDeleteId(null);
                        }}
                        className="shrink-0 px-1.5 py-0.5 rounded bg-rose-600/80 text-white text-[10px]"
                        title="Delete this ground and its layout"
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(g.id)}
                        className="shrink-0 p-1 rounded text-slate-500 hover:text-rose-300"
                        title="Delete ground"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-800 mt-1.5 pt-1.5">
            <button
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-emerald-300 hover:bg-emerald-500/10"
            >
              <Plus className="w-3.5 h-3.5" /> Create new ground
            </button>
          </div>
        </div>
      )}

      {/* Portal: the sidebar's backdrop blur would otherwise trap this full-screen dialog inside it */}
      {creating &&
        createPortal(
        <CreateGroundDialog
          existingNames={grounds.map((g) => g.name.toLowerCase())}
          onCancel={() => setCreating(false)}
          onCreate={(name, w, h) => {
            setCreating(false);
            onCreate(name, w, h);
          }}
        />,
          document.body
        )}
    </div>
  );
};

function CreateGroundDialog({
  existingNames,
  onCancel,
  onCreate,
}: {
  existingNames: string[];
  onCancel: () => void;
  onCreate: (name: string, width: number, height: number) => void;
}) {
  const [name, setName] = useState('');
  const [width, setWidth] = useState('60');
  const [height, setHeight] = useState('40');
  const [touched, setTouched] = useState(false);

  const w = Number(width);
  const h = Number(height);
  const trimmed = name.trim();
  const nameError = !trimmed
    ? 'Give the ground a name'
    : existingNames.includes(trimmed.toLowerCase())
    ? 'A ground with this name already exists'
    : null;
  const sizeOk = (n: number) => Number.isFinite(n) && n >= MIN_GROUND_M && n <= MAX_GROUND_M;
  const sizeError = !sizeOk(w) || !sizeOk(h) ? `Width and length must be ${MIN_GROUND_M}–${MAX_GROUND_M} m` : null;
  const valid = !nameError && !sizeError;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) onCreate(trimmed, Math.round(w * 10) / 10, Math.round(h * 10) / 10);
  };

  // Small preview of the proportions
  const ratio = sizeOk(w) && sizeOk(h) ? w / h : 57 / 43;
  const pw = ratio >= 1 ? 120 : 120 * ratio;
  const ph = ratio >= 1 ? 120 / ratio : 120;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-tg-panel border border-slate-700 rounded-2xl shadow-2xl p-5 font-mono text-xs text-slate-300 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 uppercase tracking-wider">
            <MapPinned className="w-4 h-4 text-emerald-300" /> New ground
          </h2>
          <button type="button" onClick={onCancel} className="p-1 rounded text-slate-500 hover:text-slate-200" title="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-slate-400">Place name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. North Field"
            maxLength={60}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-slate-400">Width (m)</span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_GROUND_M}
              max={MAX_GROUND_M}
              step={0.5}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-slate-400">Length (m)</span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_GROUND_M}
              max={MAX_GROUND_M}
              step={0.5}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-[120px] h-[120px] flex items-center justify-center shrink-0">
            <div
              className="border border-sky-500/60 bg-sky-500/10 rounded-sm"
              style={{ width: pw, height: ph }}
              aria-hidden
            />
          </div>
          <p className="text-slate-500 leading-relaxed">
            The new ground starts empty, with a 3 m safety fence inside the edge. Your current ground is saved and
            stays in the list.
          </p>
        </div>

        {touched && (nameError || sizeError) && <p className="text-rose-300">{nameError ?? sizeError}</p>}

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
            Create ground
          </button>
        </div>
      </form>
    </div>
  );
}
