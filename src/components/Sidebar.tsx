import React from 'react';
import {
  Layers,
  RotateCcw,
  RotateCw,
  Sparkles,
  Download,
  Trash2,
  FolderOpen,
  Route,
  Info,
  CheckCircle2,
  Plus,
  PenTool,
  Compass,
  Navigation,
  Orbit,
  ChevronDown,
  ChevronUp,
  X,
  Palette,
} from 'lucide-react';
import { EquipmentDef, PlacedItem } from '../types';
import { EQUIPMENT_INVENTORY } from '../constants/equipment';
import { PRESET_TRACKS } from '../constants/presets';
import { Ground } from '../utils/grounds';
import { GroundSwitcher } from './GroundSwitcher';
import { EquipmentCreator } from './EquipmentCreator';
import { CustomEquipmentInput } from '../utils/customEquipment';

interface SidebarProps {
  onCreateEquipment: (input: CustomEquipmentInput) => void;
  /** Returns a reason when the item can't be deleted */
  onDeleteEquipment: (id: string) => string | null;
  grounds: Ground[];
  activeGround: Ground;
  onSwitchGround: (ground: Ground) => void;
  onCreateGround: (name: string, width: number, height: number) => void;
  onDeleteGround: (id: string) => void;
  items: PlacedItem[];
  placingEquipId: string | null;
  onSelectPlacingEquip: (equipId: string | null) => void;
  onClearField: () => void;
  onLoadPreset: (presetId: string) => void;
  onOpenSaveModal: () => void;
  onAutoSequence: () => void;
  onClearSequence: () => void;
  selectedItemId: string | null;
  onDeleteItem: (id: string) => void;
  isDrawMode?: boolean;
  onToggleDrawMode?: () => void;
  hasDrawnPath?: boolean;
  onClearDrawnPath?: () => void;
  onSmoothDrawnPath?: () => void;
  onGenerateCurveFromGates?: () => void;
  onRotateAllYaw?: (deltaDeg: number, rotatePositions: boolean) => void;
  onSetAllYaw?: (targetYawDeg: number) => void;
  defaultPlacementYaw?: number;
  onChangeDefaultPlacementYaw?: (yaw: number) => void;
  /** Phone layout: whether the slide-in drawer is open */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** Colour theme */
  themeName?: string;
  onOpenThemePicker?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onCreateEquipment,
  onDeleteEquipment,
  grounds,
  activeGround,
  onSwitchGround,
  onCreateGround,
  onDeleteGround,
  items,
  placingEquipId,
  onSelectPlacingEquip,
  onClearField,
  onLoadPreset,
  onOpenSaveModal,
  onAutoSequence,
  onClearSequence,
  isDrawMode = false,
  onToggleDrawMode,
  hasDrawnPath = false,
  onClearDrawnPath,
  onSmoothDrawnPath,
  onGenerateCurveFromGates,
  onRotateAllYaw,
  onSetAllYaw,
  defaultPlacementYaw = 0,
  onChangeDefaultPlacementYaw,
  mobileOpen = false,
  onCloseMobile,
  themeName,
  onOpenThemePicker,
}) => {
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [creatingEquipment, setCreatingEquipment] = React.useState(false);
  const [confirmDeleteEquipId, setConfirmDeleteEquipId] = React.useState<string | null>(null);
  const [yawRotateMode, setYawRotateMode] = React.useState<'heading' | 'orbit'>('heading');
  const [isYawExpanded, setIsYawExpanded] = React.useState<boolean>(true);

  const totalUsed = items.length;

  const handleDragStart = (e: React.DragEvent, equipId: string) => {
    e.dataTransfer.setData('text/plain', equipId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleClearClick = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3500);
    } else {
      setConfirmClear(false);
      onClearField();
    }
  };

  return (
    <aside
      id="inventory-sidebar"
      className={`w-80 md:w-88 flex flex-col bg-slate-900/95 backdrop-blur-md border-r border-slate-800 text-slate-200 select-none z-20 shrink-0 h-full shadow-2xl compact:fixed compact:inset-y-0 compact:left-0 compact:z-50 compact:w-[min(22rem,88vw)] compact:bg-slate-900 compact:transition-transform compact:duration-200 safe-drawer ${
        mobileOpen ? '' : 'compact:-translate-x-full compact:shadow-none'
      }`}
    >
      {/* App Header */}
      <div className="p-4 border-b border-slate-800 bg-tg-panel">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-bold font-mono text-sm">
            TG
          </div>
          <GroundSwitcher
            grounds={grounds}
            activeGround={activeGround}
            onSwitch={onSwitchGround}
            onCreate={onCreateGround}
            onDelete={onDeleteGround}
          />
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="hidden compact:flex ml-auto shrink-0 w-9 h-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 active:bg-slate-800"
              aria-label="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Global Inventory Meter */}
        <div className="mt-3 bg-slate-900/80 rounded-md p-2.5 border border-slate-800">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-slate-400">Deployed On Field</span>
            <span className="text-sky-400 font-semibold">
              {totalUsed} Gates (Unlimited Stock)
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${Math.min(100, (totalUsed / 25) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Equipment Inventory List */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 custom-scrollbar">
        <div className="flex items-center justify-between text-[11px] font-mono tracking-wider text-slate-400 uppercase px-1">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            Equipment Inventory
          </span>
          <button
            onClick={() => setCreatingEquipment(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 normal-case tracking-normal text-[10px] font-semibold"
            title="Design your own gate, flag or cube"
          >
            <Plus className="w-3 h-3" /> New item
          </button>
        </div>
        {creatingEquipment && (
          <EquipmentCreator
            existingNames={EQUIPMENT_INVENTORY.map((e) => e.name.toLowerCase())}
            onCancel={() => setCreatingEquipment(false)}
            onCreate={(input) => {
              setCreatingEquipment(false);
              onCreateEquipment(input);
            }}
          />
        )}

        {/* Global Equipment Yaw / Orientation Controls */}
        <div
          id="inventory-yaw-controls"
          className="bg-slate-900/90 rounded-lg p-2.5 border border-sky-500/30 shadow-md shadow-sky-950/20"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
              <span className="text-xs font-mono font-bold text-slate-100">
                Yaw Rotate Equipment
              </span>
            </div>
            <button
              onClick={() => setIsYawExpanded(!isYawExpanded)}
              className="text-slate-400 hover:text-slate-200 text-[10px] font-mono flex items-center gap-0.5"
            >
              {isYawExpanded ? (
                <>
                  <span className="text-slate-500">Hide</span>
                  <ChevronUp className="w-3 h-3 text-slate-400" />
                </>
              ) : (
                <>
                  <span className="text-amber-400 font-semibold">{items.length} items</span>
                  <ChevronDown className="w-3 h-3 text-amber-400" />
                </>
              )}
            </button>
          </div>

          {isYawExpanded && (
            <div className="space-y-2 text-xs font-mono">
              {/* Rotation Mode Selector (In-Place vs Field Orbit) */}
              <div className="grid grid-cols-2 gap-1 bg-slate-950/80 p-0.5 rounded border border-slate-800 text-[10px]">
                <button
                  id="btn-yaw-mode-heading"
                  onClick={() => setYawRotateMode('heading')}
                  className={`py-1 px-1.5 rounded transition text-center flex items-center justify-center gap-1 ${
                    yawRotateMode === 'heading'
                      ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Rotate only the heading facing angle of all equipment at their current positions"
                >
                  <Navigation className="w-2.5 h-2.5" />
                  <span>In-Place (Facing)</span>
                </button>
                <button
                  id="btn-yaw-mode-orbit"
                  onClick={() => setYawRotateMode('orbit')}
                  className={`py-1 px-1.5 rounded transition text-center flex items-center justify-center gap-1 ${
                    yawRotateMode === 'orbit'
                      ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Rotate the whole track layout (positions + headings) around field center (28.5m, 21.5m)"
                >
                  <Orbit className="w-2.5 h-2.5" />
                  <span>Track Orbit (Field)</span>
                </button>
              </div>

              {/* Step Buttons: +/-15°, +/-45°, +/-90° */}
              <div>
                <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-between">
                  <span>Step Rotate All Placed ({items.length} items):</span>
                  <span className="text-[9px] text-slate-500 font-mono">Alt+R: ±15°</span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  <button
                    id="btn-yaw-all-m90"
                    onClick={() => onRotateAllYaw?.(-90, yawRotateMode === 'orbit')}
                    disabled={items.length === 0}
                    className="py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 border border-slate-700 text-[10px] transition text-center hover:text-amber-300"
                    title={`Rotate all equipment -90° ${yawRotateMode === 'orbit' ? '(Orbit)' : '(In-Place)'}`}
                  >
                    -90°
                  </button>
                  <button
                    id="btn-yaw-all-m45"
                    onClick={() => onRotateAllYaw?.(-45, yawRotateMode === 'orbit')}
                    disabled={items.length === 0}
                    className="py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 border border-slate-700 text-[10px] transition text-center hover:text-amber-300"
                    title={`Rotate all equipment -45° ${yawRotateMode === 'orbit' ? '(Orbit)' : '(In-Place)'}`}
                  >
                    -45°
                  </button>
                  <button
                    id="btn-yaw-all-m15"
                    onClick={() => onRotateAllYaw?.(-15, yawRotateMode === 'orbit')}
                    disabled={items.length === 0}
                    className="py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-amber-300 font-bold border border-slate-700 text-[10px] transition text-center"
                    title={`Rotate all equipment -15° ${yawRotateMode === 'orbit' ? '(Orbit)' : '(In-Place)'}`}
                  >
                    ↺ -15°
                  </button>
                  <button
                    id="btn-yaw-all-p15"
                    onClick={() => onRotateAllYaw?.(15, yawRotateMode === 'orbit')}
                    disabled={items.length === 0}
                    className="py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-amber-300 font-bold border border-slate-700 text-[10px] transition text-center"
                    title={`Rotate all equipment +15° ${yawRotateMode === 'orbit' ? '(Orbit)' : '(In-Place)'}`}
                  >
                    +15° ↻
                  </button>
                  <button
                    id="btn-yaw-all-p45"
                    onClick={() => onRotateAllYaw?.(45, yawRotateMode === 'orbit')}
                    disabled={items.length === 0}
                    className="py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 border border-slate-700 text-[10px] transition text-center hover:text-amber-300"
                    title={`Rotate all equipment +45° ${yawRotateMode === 'orbit' ? '(Orbit)' : '(In-Place)'}`}
                  >
                    +45°
                  </button>
                  <button
                    id="btn-yaw-all-p90"
                    onClick={() => onRotateAllYaw?.(90, yawRotateMode === 'orbit')}
                    disabled={items.length === 0}
                    className="py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 border border-slate-700 text-[10px] transition text-center hover:text-amber-300"
                    title={`Rotate all equipment +90° ${yawRotateMode === 'orbit' ? '(Orbit)' : '(In-Place)'}`}
                  >
                    +90°
                  </button>
                </div>
              </div>

              {/* Invert 180° and Set Facing Presets */}
              <div className="flex items-center gap-1 pt-0.5">
                <button
                  id="btn-yaw-all-180"
                  onClick={() => onRotateAllYaw?.(180, yawRotateMode === 'orbit')}
                  disabled={items.length === 0}
                  className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 text-[10px] transition text-center hover:text-sky-300 flex items-center justify-center gap-1"
                  title="Rotate all 180° (Invert)"
                >
                  <RotateCw className="w-2.5 h-2.5 text-sky-400" />
                  <span>Flip 180°</span>
                </button>
                <div className="flex items-center gap-0.5">
                  {[
                    { label: '0° N', angle: 0 },
                    { label: '90° E', angle: 90 },
                    { label: '180° S', angle: 180 },
                    { label: '270° W', angle: 270 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => onSetAllYaw?.(p.angle)}
                      disabled={items.length === 0}
                      className="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 text-slate-400 hover:text-slate-200 border border-slate-700 text-[9px] transition"
                      title={`Align all placed equipment yaw to ${p.angle}°`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Inventory Placement Yaw (Spawn Yaw) */}
              {onChangeDefaultPlacementYaw && (
                <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Navigation className="w-2.5 h-2.5 text-sky-400" />
                    Spawn Yaw:
                  </span>
                  <div className="flex items-center gap-1">
                    {[0, 45, 90, 180, 270].map((deg) => (
                      <button
                        key={deg}
                        id={`btn-spawn-yaw-${deg}`}
                        onClick={() => onChangeDefaultPlacementYaw(deg)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition border ${
                          defaultPlacementYaw === deg
                            ? 'bg-sky-500/25 text-sky-300 border-sky-400 font-bold'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                        title={`New gates from inventory will spawn at ${deg}°`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {EQUIPMENT_INVENTORY.map((eq) => {
          const placedCount = items.filter((i) => i.equipId === eq.id).length;
          const isPlacing = placingEquipId === eq.id;

          return (
            <div
              key={eq.id}
              id={`inventory-item-${eq.id}`}
              draggable
              onDragStart={(e) => handleDragStart(e, eq.id)}
              onClick={() => {
                onSelectPlacingEquip(isPlacing ? null : eq.id);
              }}
              className={`group relative p-2.5 rounded-lg border transition-all cursor-pointer ${
                isPlacing
                  ? 'bg-sky-950/40 border-sky-400 shadow-md shadow-sky-500/10'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Visual Icon Matching Exact Spec */}
                <div className="w-12 h-10 rounded bg-tg-panel border border-slate-800 flex items-center justify-center shrink-0 p-1">
                  <EquipmentVisualPreview visualType={eq.visualType} />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="text-xs font-semibold text-slate-200 truncate font-mono flex items-center gap-1.5">
                      {eq.isCustom && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: eq.color }} />
                      )}
                      <span className="truncate">{eq.name}</span>
                    </h3>
                    {eq.isCustom &&
                      (confirmDeleteEquipId === eq.id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteEquipId(null);
                            const problem = onDeleteEquipment(eq.id);
                            if (problem) alert(problem);
                          }}
                          className="shrink-0 px-1.5 py-0.5 rounded bg-rose-600/80 text-white text-[10px] font-mono"
                        >
                          Delete?
                        </button>
                      ) : (
                        <span className="shrink-0 flex items-center gap-1">
                          <span className="px-1 rounded bg-emerald-500/15 text-emerald-300 text-[9px] font-mono uppercase">
                            Custom
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteEquipId(eq.id);
                            }}
                            className="p-0.5 rounded text-slate-500 hover:text-rose-300"
                            title="Delete this custom item"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {eq.description}
                  </p>

                  <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono">
                    <span className="text-slate-400">
                      {eq.width}m × {eq.depth}m · {eq.heightDesc}
                    </span>
                    <span className="font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-sky-300">
                      {placedCount > 0 ? `${placedCount} placed · ∞` : '∞ Unlimited'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Spawn Yaw quick adjust when placing */}
              {isPlacing && (
                <div
                  className="mt-2 pt-2 border-t border-sky-900/50 flex items-center justify-between text-[10px] font-mono text-amber-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="flex items-center gap-1 font-bold">
                    <Compass className="w-3 h-3 text-amber-400" />
                    Yaw: {defaultPlacementYaw ?? 0}°
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        onChangeDefaultPlacementYaw?.(
                          ((defaultPlacementYaw ?? 0) - 15 + 360) % 360
                        )
                      }
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] transition"
                      title="Rotate placement yaw -15° (Shift+R / Scroll)"
                    >
                      ↺ -15°
                    </button>
                    <button
                      onClick={() =>
                        onChangeDefaultPlacementYaw?.(
                          ((defaultPlacementYaw ?? 0) + 15) % 360
                        )
                      }
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] transition"
                      title="Rotate placement yaw +15° (R / Scroll)"
                    >
                      +15° ↻
                    </button>
                    <button
                      onClick={() =>
                        onChangeDefaultPlacementYaw?.(
                          ((defaultPlacementYaw ?? 0) + 90) % 360
                        )
                      }
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] transition"
                      title="Rotate +90°"
                    >
                      90°
                    </button>
                  </div>
                </div>
              )}

              {/* Status Indicator */}
              {isPlacing && (
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[9px] font-mono text-sky-400 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-500/30">
                  <Plus className="w-2.5 h-2.5 animate-pulse" />
                  Click field
                </div>
              )}
            </div>
          );
        })}

        {/* Quick Presets Section */}
        <div className="pt-2">
          <div className="text-[11px] font-mono tracking-wider text-slate-400 uppercase px-1 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Preset Pro Layouts
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {PRESET_TRACKS.map((preset) => (
              <button
                key={preset.id}
                id={`btn-preset-${preset.id}`}
                onClick={() => onLoadPreset(preset.id)}
                className="w-full text-left p-2 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between group"
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono font-medium text-slate-300 group-hover:text-sky-300 truncate">
                    {preset.name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {preset.items.length} gates · {preset.droneSpeedKmH} km/h flow
                  </p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-sky-400 shrink-0 ml-2">
                  Load →
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Flight Path Utilities */}
        <div className="pt-2">
          <div className="text-[11px] font-mono tracking-wider text-slate-400 uppercase px-1 mb-2 flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5 text-cyan-400" />
            Flight Path Sequencer
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              id="btn-auto-sequence"
              onClick={onAutoSequence}
              className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800 text-xs font-mono text-cyan-300 transition flex items-center justify-center gap-1.5"
              title="Automatically assign sequential gate numbers 1, 2, 3..."
            >
              <Route className="w-3 h-3 text-cyan-400" />
              Auto-Order
            </button>
            <button
              id="btn-clear-sequence"
              onClick={onClearSequence}
              className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-xs font-mono text-slate-400 transition flex items-center justify-center gap-1.5"
              title="Remove waypoint sequence numbers from all gates"
            >
              <RotateCcw className="w-3 h-3" />
              Unlink Path
            </button>
          </div>

          {/* Draw Racing Line Tool */}
          {onToggleDrawMode && (
            <div className="mt-2 space-y-1.5">
              <button
                id="btn-sidebar-draw-line"
                onClick={onToggleDrawMode}
                className={`w-full px-2.5 py-1.5 rounded border transition flex items-center justify-center gap-1.5 text-xs font-mono ${
                  isDrawMode
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm shadow-amber-500/30'
                    : hasDrawnPath
                    ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/50'
                    : 'bg-slate-900 border-slate-700 text-amber-300 hover:border-amber-400 hover:bg-slate-800'
                }`}
                title="Draw custom track line directly on the canvas"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{isDrawMode ? 'Exit Draw Mode' : hasDrawnPath ? 'Edit Drawn Line' : 'Draw Track Line'}</span>
              </button>

              {hasDrawnPath ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {onSmoothDrawnPath && (
                    <button
                      id="btn-sidebar-smooth-line"
                      onClick={onSmoothDrawnPath}
                      className="px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-[11px] font-mono text-cyan-300 transition flex items-center justify-center gap-1"
                      title="Smooth the drawn track curves"
                    >
                      <Sparkles className="w-3 h-3 text-cyan-400" />
                      Smooth
                    </button>
                  )}
                  {onClearDrawnPath && (
                    <button
                      id="btn-sidebar-clear-line"
                      onClick={onClearDrawnPath}
                      className="px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-[11px] font-mono text-rose-300 transition flex items-center justify-center gap-1"
                      title="Clear the drawn line"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                      Clear Line
                    </button>
                  )}
                </div>
              ) : (
                onGenerateCurveFromGates && items.length >= 2 && (
                  <button
                    id="btn-sidebar-auto-curve"
                    onClick={onGenerateCurveFromGates}
                    className="w-full py-1.5 px-2 rounded bg-slate-900/80 border border-purple-500/40 hover:border-purple-400 text-purple-300 font-mono text-[11px] transition flex items-center justify-center gap-1.5 hover:bg-purple-950/30"
                    title="Auto-calculate smooth racing line through all sequenced gates and orbit flag poles"
                  >
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>Auto-Curve From Gates</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Action Buttons */}
      <div className="p-3 border-t border-slate-800 bg-tg-panel space-y-2">
        <button
          id="btn-save-track"
          onClick={onOpenSaveModal}
          className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-slate-950 font-mono font-bold text-xs tracking-wider uppercase transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          Save & Export Track
        </button>

        {onOpenThemePicker && (
          <button
            id="btn-theme"
            onClick={onOpenThemePicker}
            className="w-full py-2 px-3 rounded border border-slate-800 bg-slate-900 hover:border-sky-500/60 hover:bg-slate-800 text-xs font-mono text-slate-300 transition flex items-center justify-center gap-1.5"
            title="Change the app's colour theme"
          >
            <Palette className="w-3.5 h-3.5 text-sky-400" />
            <span>Theme:</span>
            <span className="text-sky-300 font-bold truncate">{themeName}</span>
          </button>
        )}

        <button
          id="btn-clear-field"
          onClick={handleClearClick}
          className={`w-full py-2 px-3 rounded border text-xs font-mono transition flex items-center justify-center gap-1.5 ${
            confirmClear
              ? 'bg-rose-600 hover:bg-rose-500 border-rose-400 text-white font-bold animate-pulse shadow-lg shadow-rose-600/30'
              : 'bg-slate-900 hover:bg-rose-950/40 border-slate-800 hover:border-rose-700 text-rose-300'
          }`}
          title="Clear all gates and drawn lines from the field"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {confirmClear ? 'Click again to confirm Reset' : 'Clear Field (Reset)'}
        </button>
      </div>
    </aside>
  );
};

// Visual representation preview component in inventory
function EquipmentVisualPreview({ visualType }: { visualType: string }) {
  switch (visualType) {
    case 'single_gate_blue':
      // Blue rectangle
      return (
        <div className="w-8 h-3.5 bg-blue-600 border border-blue-400 rounded-xs flex items-center justify-between px-0.5">
          <div className="w-1 h-full bg-blue-300" />
          <div className="w-1 h-full bg-blue-300" />
        </div>
      );

    case 'single_gate_lightblue':
      // 1.5m arch with 1m pole on top of one side (2.5m total height on that side)
      return (
        <div className="relative w-8 h-6 flex items-end justify-center">
          {/* Base 1.5m Arch Gate */}
          <div className="w-5 h-3.5 border-2 border-sky-400 border-b-0 rounded-t-sm bg-sky-950/40 relative">
            {/* Right leg upright extending 1m upward to 2.5m total height */}
            <div className="absolute -right-[2px] bottom-0 w-[2px] h-[22px] bg-orange-400 rounded-t-full flex flex-col items-center">
              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full -mt-0.5 border border-amber-300" />
            </div>
          </div>
        </div>
      );

    case 'vertical_double':
    case 'vertical_triple':
      // 3 single 2mx2m stacked vertically (6m tall)
      return (
        <div className="flex flex-col gap-0.5 items-center">
          <div className="w-5 h-1.5 bg-purple-400 border border-purple-200 rounded-xs" />
          <div className="w-5 h-1.5 bg-purple-600 border border-purple-300 rounded-xs" />
          <div className="w-5 h-1.5 bg-purple-900 border border-purple-500 rounded-xs" />
        </div>
      );

    case 'vertical_quad':
      // 4 single 2mx2m stacked vertically (8m tall)
      return (
        <div className="flex flex-col gap-0.5 items-center">
          <div className="w-5 h-1 bg-purple-300 border border-purple-100 rounded-xs" />
          <div className="w-5 h-1 bg-purple-500 border border-purple-300 rounded-xs" />
          <div className="w-5 h-1 bg-purple-700 border border-purple-400 rounded-xs" />
          <div className="w-5 h-1 bg-purple-950 border border-purple-600 rounded-xs" />
        </div>
      );

    case 'flag_pole':
      // Orange circle with dot
      return (
        <div className="w-5 h-5 rounded-full bg-orange-600 border border-orange-400 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
        </div>
      );

    case 'cube_gate':
      // Green square outline
      return (
        <div className="w-5 h-5 border-2 border-emerald-400 bg-emerald-950/40 rounded-xs flex items-center justify-center">
          <div className="w-2.5 h-2.5 border border-emerald-300/60" />
        </div>
      );

    case 'double_cube':
      // Two 2m x 2m cubes stacked vertically (4m tall vertical double cube)
      return (
        <div className="flex flex-col gap-0.5 items-center">
          <div className="w-5 h-2.5 border-2 border-emerald-400 bg-emerald-950/60 rounded-xs flex items-center justify-center">
            <span className="text-[7px] text-emerald-300 font-bold leading-none">2m</span>
          </div>
          <div className="w-5 h-2.5 border-2 border-emerald-600 bg-emerald-950/80 rounded-xs flex items-center justify-center">
            <span className="text-[7px] text-emerald-400 font-bold leading-none">0m</span>
          </div>
        </div>
      );

    default:
      return <div className="w-4 h-4 bg-slate-700" />;
  }
}
