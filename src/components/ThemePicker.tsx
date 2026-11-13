import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Palette as PaletteIcon, X } from 'lucide-react';
import { PALETTES, Palette } from '../theme/palettes';
import { buildTheme } from '../theme/engine';

interface ThemePickerProps {
  isOpen: boolean;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** A small preview of how the app looks in a palette: panel, text, active button, turf, race line. */
const ThemePreview: React.FC<{ palette: Palette }> = ({ palette }) => {
  const t = React.useMemo(() => buildTheme(palette), [palette]);
  const v = (name: string, fallback: string) => t.vars[name] ?? fallback;
  const panel = v('--color-tg-panel', '#090d16');
  const text = v('--color-slate-100', '#f1f5f9');
  const muted = v('--color-slate-400', '#90a1b9');
  const border = v('--color-slate-700', '#314158');
  const accentBg = v('--color-sky-500', '#00bcff');
  return (
    <div className="flex h-20 rounded-lg overflow-hidden border" style={{ borderColor: border }} aria-hidden>
      <div className="w-[42%] p-2 flex flex-col gap-1.5" style={{ background: panel }}>
        <div className="h-1.5 w-4/5 rounded-full" style={{ background: text }} />
        <div className="h-1.5 w-3/5 rounded-full" style={{ background: muted }} />
        <div className="mt-auto h-3.5 w-full rounded" style={{ background: accentBg }} />
      </div>
      <div className="flex-1 relative" style={{ background: t.field.turf }}>
        <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <rect x="8" y="8" width="84" height="44" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" />
          <path d="M20 42 C 16 24, 34 16, 50 18 S 82 18, 80 34 S 50 46, 20 42 Z" fill="none" stroke={t.field.autoPath} strokeWidth="2.6" />
        </svg>
        <span className="absolute bottom-1 right-1.5 text-[9px] font-bold font-mono" style={{ color: t.field.pillText }}>
          4.5 s
        </span>
      </div>
    </div>
  );
};

export const ThemePicker: React.FC<ThemePickerProps> = ({ isOpen, activeId, onSelect, onClose }) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Portal: the sidebar's backdrop blur would otherwise trap this full-screen dialog inside it
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-tg-panel border border-slate-700 rounded-2xl shadow-2xl font-mono text-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <PaletteIcon className="w-5 h-5 text-sky-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Colour Theme</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="px-5 pt-3 text-[11px] text-slate-400 leading-relaxed">
          Each theme follows a 60 · 30 · 10 palette: <span className="text-slate-200">60% background</span>,{' '}
          <span className="text-slate-200">30% text</span> and <span className="text-sky-300 font-bold">10% accent</span> for
          active buttons and the race line. The field stays dark so gates are easy to see.
        </p>

        <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PALETTES.map((p) => {
            const active = p.id === activeId;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`text-left p-2.5 rounded-xl border transition ${
                  active ? 'border-sky-400 bg-sky-500/10 ring-1 ring-sky-400/60' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                }`}
                aria-pressed={active}
              >
                <ThemePreview palette={p} />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      {p.name}
                      {active && <Check className="w-3.5 h-3.5 text-sky-400" />}
                    </div>
                    <div className="text-[10px] text-slate-400">{p.mood}</div>
                  </div>
                  <div className="flex shrink-0 rounded-md overflow-hidden border border-slate-700" title="60 · 30 · 10">
                    <span className="w-6 h-4" style={{ background: p.base }} />
                    <span className="w-3 h-4" style={{ background: p.support }} />
                    <span className="w-1.5 h-4" style={{ background: p.accent }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
