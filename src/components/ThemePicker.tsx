import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Palette as PaletteIcon, Sparkles, Square, X } from 'lucide-react';
import { PALETTES, Palette } from '../theme/palettes';
import { buildTheme, Look } from '../theme/engine';
import { COASTAL_SUNSET } from '../theme/coastalSunset';

interface ThemePickerProps {
  isOpen: boolean;
  activeId: string;
  look: Look;
  onSelectLook: (look: Look) => void;
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

/** Preview of the Desert Site look: hazy sky, sand with olive scrub, a green turf pitch and the race line. */
const DesertPreview: React.FC = () => (
  <div className="h-20 rounded-lg overflow-hidden border border-slate-700 relative" aria-hidden>
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="tgDesertSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#AFC0CC" />
          <stop offset="1" stopColor="#C9CFD2" />
        </linearGradient>
      </defs>
      <rect width="100" height="22" fill="url(#tgDesertSky)" />
      <rect y="22" width="100" height="38" fill="#B3A58E" />
      {[[8, 28], [18, 34], [30, 27], [72, 30], [88, 36], [94, 26], [12, 50], [86, 52], [60, 26], [40, 54]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 ? 1.6 : 2.4} fill="#4A4A33" />
      ))}
      <rect x="30" y="34" width="40" height="18" fill="#2E7D1F" stroke="#1F5F2A" strokeWidth="0.8" />
      <path d="M36 46 C 36 38, 50 37, 56 40 S 66 47, 60 49 S 40 51, 36 46 Z" fill="none" stroke="#1D6FE0" strokeWidth="1.6" />
      <rect x="74" y="36" width="10" height="7" fill="#E8E6E1" />
    </svg>
  </div>
);

/** Preview of the Animated look: deep teal water, drowned towers, a mossy deck and an amber race line. */
const AnimatedPreview: React.FC = () => (
  <div className="tg-anim-preview h-20 rounded-lg overflow-hidden border border-slate-700 relative" aria-hidden>
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="tgSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6FD8C9" />
          <stop offset="0.35" stopColor="#1E7470" />
          <stop offset="0.36" stopColor="#12555C" />
          <stop offset="1" stopColor="#06222A" />
        </linearGradient>
        <pattern id="tgPlanks" width="100" height="5" patternUnits="userSpaceOnUse">
          <rect width="100" height="5" fill="#A8714A" />
          <rect y="4.3" width="100" height="0.7" fill="#6B4128" />
        </pattern>
      </defs>
      <rect width="100" height="60" fill="url(#tgSky)" />
      <rect x="6" y="14" width="3" height="8" fill="#2E6A5E" opacity="0.9" />
      <rect x="11" y="10" width="4" height="12" fill="#2E6A5E" opacity="0.75" />
      <rect x="84" y="12" width="5" height="10" fill="#2E6A5E" opacity="0.8" />
      <path d="M8 34 Q 20 32 30 34 M60 30 Q 72 28 84 30" stroke="#CFFFF5" strokeWidth="0.8" fill="none" opacity="0.7" />
      <path d="M30 0 L22 60 L34 60 Z M62 0 L56 60 L70 60 Z" fill="#E6FFF6" opacity="0.10" />
      <rect x="22" y="27" width="58" height="28" rx="1.5" fill="url(#tgPlanks)" stroke="#4A2E1E" strokeWidth="1" />
      <circle cx="17" cy="40" r="1" fill="none" stroke="#E6FFF6" strokeWidth="0.4" />
      <circle cx="15" cy="34" r="0.7" fill="none" stroke="#E6FFF6" strokeWidth="0.4" />
      <circle cx="86" cy="44" r="0.9" fill="none" stroke="#E6FFF6" strokeWidth="0.4" />
      <path d="M32 48 C 28 36, 42 31, 52 33 S 74 33, 72 42 S 50 52, 32 48 Z" fill="none" stroke="#FFC23D" strokeWidth="2.4" />
    </svg>
    <span className="absolute bottom-1 right-1.5 px-1 rounded bg-[#262c3e]/90 text-[9px] font-bold text-white">4.5 s</span>
  </div>
);

const SunsetPreview: React.FC = () => (
  <div className="tg-sunset-preview h-20 rounded-lg overflow-hidden border relative" style={{ borderColor: COASTAL_SUNSET.field.grid3d }} aria-hidden>
    <div className="absolute inset-0" style={{ background: `linear-gradient(${COASTAL_SUNSET.scene.sky[0]}, ${COASTAL_SUNSET.scene.sky[2]}, ${COASTAL_SUNSET.scene.sky[4]})` }} />
    <div className="absolute bottom-0 h-7 w-full" style={{ background: `linear-gradient(${COASTAL_SUNSET.ui.water}, ${COASTAL_SUNSET.ui.waterDeep})` }} />
    <div className="absolute bottom-3 left-[13%] right-[13%] h-9 rounded-sm border" style={{ background: COASTAL_SUNSET.scene.tarmac[1], borderColor: COASTAL_SUNSET.field.border }} />
    <div className="absolute bottom-5 left-[23%] right-[23%] h-[2px] rounded-full" style={{ background: COASTAL_SUNSET.field.autoPath, boxShadow: `0 0 8px ${COASTAL_SUNSET.field.autoPath}` }} />
    <div className="absolute right-[8%] top-2 h-6 w-6 rounded-full blur-[1px]" style={{ background: COASTAL_SUNSET.scene.sun }} />
    <span className="absolute bottom-1 right-1.5 px-1 rounded text-[9px] font-bold text-white" style={{ background: COASTAL_SUNSET.ui.panel }}>4.5 s</span>
  </div>
);

/** Preview of the Trading Floor look: near-black card, one yellow button, candlesticks, yellow line. */
const TradingPreview: React.FC = () => (
  <div className="flex h-20 rounded-lg overflow-hidden border" style={{ borderColor: '#2B3139' }} aria-hidden>
    <div className="w-[42%] p-2 flex flex-col gap-1.5" style={{ background: '#1E2329' }}>
      <div className="h-1.5 w-4/5 rounded-sm" style={{ background: '#EAECEF' }} />
      <div className="h-1.5 w-3/5 rounded-sm" style={{ background: '#707A8A' }} />
      <div className="mt-auto h-3.5 w-full rounded-[3px]" style={{ background: '#FCD535' }} />
    </div>
    <div className="flex-1 relative" style={{ background: '#0B0E11' }}>
      <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        {[8, 18, 28, 72, 82, 92].map((x, i) => (
          <g key={x}>
            <line x1={x} x2={x} y1={i % 2 ? 6 : 10} y2={i % 2 ? 26 : 30} stroke={i % 3 === 1 ? '#F6465D' : '#0ECB81'} strokeWidth="0.6" />
            <rect x={x - 2.5} y={i % 2 ? 10 : 14} width="5" height={i % 2 ? 12 : 10} fill={i % 3 === 1 ? '#F6465D' : '#0ECB81'} />
          </g>
        ))}
        <rect x="14" y="30" width="72" height="26" fill="#181A20" stroke="#2B3139" />
        <path d="M24 48 C 20 36, 36 33, 50 34 S 78 34, 76 42 S 50 52, 24 48 Z" fill="none" stroke="#FCD535" strokeWidth="2.2" />
      </svg>
    </div>
  </div>
);

/** Preview of the Showroom look: white panel, grey text, one blue button, concrete field. */
const ShowroomPreview: React.FC = () => (
  <div className="flex h-20 rounded-lg overflow-hidden border" style={{ borderColor: '#D0D1D2' }} aria-hidden>
    <div className="w-[42%] p-2 flex flex-col gap-1.5" style={{ background: '#FFFFFF' }}>
      <div className="h-1.5 w-4/5 rounded-sm" style={{ background: '#171A20' }} />
      <div className="h-1.5 w-3/5 rounded-sm" style={{ background: '#8E8E8E' }} />
      <div className="mt-auto h-3.5 w-full rounded-[2px]" style={{ background: '#3E6AE1' }} />
    </div>
    <div className="flex-1 relative" style={{ background: 'linear-gradient(#CDD3DB, #E7E5E1 55%, #8D9096 56%, #6E7177)' }}>
      <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <rect x="12" y="26" width="76" height="28" fill="#33363C" />
        <path d="M24 46 C 20 34, 36 30, 50 31 S 78 31, 76 40 S 50 50, 24 46 Z" fill="none" stroke="#6E95F7" strokeWidth="2.2" />
      </svg>
    </div>
  </div>
);

export const ThemePicker: React.FC<ThemePickerProps> = ({ isOpen, activeId, look, onSelectLook, onSelect, onClose }) => {
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
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Look &amp; Theme</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto">
        <div className="px-5 pt-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2">Look</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { id: 'desert' as Look, name: 'Desert Site', mood: 'The default. Real desert colours: sand, olive scrub, turf green and a hazy morning sky.', icon: Square },
              { id: 'normal' as Look, name: 'Normal look', mood: 'Flat, technical. Uses the colour theme below.', icon: Square },
              { id: 'animated' as Look, name: 'Animated look', mood: 'Sunken city: a mossy deck on a drowned tower, light rays, fish and bubbles in 3D.', icon: Sparkles },
              { id: 'sunset' as Look, name: COASTAL_SUNSET.look.name, mood: 'Animated palms, boats, birds and a tropical sunset skyline.', icon: Sparkles },
              { id: 'trading' as Look, name: 'Trading Floor', mood: 'Near-black with one yellow and green / red signals. In 3D: candlestick columns around a dark floor.', icon: Sparkles },
              { id: 'showroom' as Look, name: 'Showroom', mood: 'White and minimal, one blue accent. In 3D: polished concrete under a hazy city sky.', icon: Square },
            ]).map((o) => {
              const active = o.id === look;
              const Icon = o.icon;
              return (
                <button
                  key={o.id}
                  id={`btn-look-${o.id}`}
                  onClick={() => onSelectLook(o.id)}
                  className={`text-left p-2.5 rounded-xl border transition ${
                    active ? 'border-sky-400 bg-sky-500/10 ring-1 ring-sky-400/60' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                  }`}
                  aria-pressed={active}
                >
                  {o.id === 'desert' ? (
                    <DesertPreview />
                  ) : o.id === 'trading' ? (
                    <TradingPreview />
                  ) : o.id === 'showroom' ? (
                    <ShowroomPreview />
                  ) : o.id === 'sunset' ? (
                    <SunsetPreview />
                  ) : o.id === 'animated' ? (
                    <AnimatedPreview />
                  ) : (
                    <ThemePreview palette={PALETTES.find((p) => p.id === activeId) ?? PALETTES[0]} />
                  )}
                  <div className="mt-2 text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-sky-400" />
                    {o.name}
                    {o.id === 'desert' && (
                      <span className="px-1 rounded bg-emerald-500/15 text-emerald-300 text-[9px] font-mono uppercase">Default</span>
                    )}
                    {active && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </div>
                  <div className="text-[10px] text-slate-400">{o.mood}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 pt-5 text-[11px] font-bold uppercase tracking-wider text-slate-300">Colour theme (normal look)</div>
        <p className="px-5 pt-1 text-[11px] text-slate-400 leading-relaxed">
          Each theme follows a 60 · 30 · 10 palette: <span className="text-slate-200">60% background</span>,{' '}
          <span className="text-slate-200">30% text</span> and <span className="text-sky-300 font-bold">10% accent</span> for
          active buttons and the race line. The field stays dark so gates are easy to see. Picking one switches
          back to the normal look.
        </p>

        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PALETTES.map((p) => {
            const active = look === 'normal' && p.id === activeId;
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
