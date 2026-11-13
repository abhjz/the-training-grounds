import React from 'react';
import {
  Maximize2,
  ZoomIn,
  ZoomOut,
  Repeat,
  Gauge,
  HelpCircle,
  Grid,
  PenTool,
  Sparkles,
  Undo2,
  Redo2,
  Trash2,
  Wand2,
  Check,
  Ruler,
  Palette,
  Compass,
  RotateCw,
  RotateCcw,
  Orbit,
  Navigation,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { TrackMetrics } from '../types';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M } from '../constants/equipment';

export const TRACK_LINE_COLORS = [
  { id: 'red', label: 'Crimson Red', hex: '#ef4444' },
  { id: 'green', label: 'Neon Green', hex: '#22c55e' },
  { id: 'cyan', label: 'Cyan Blue', hex: '#06b6d4' },
  { id: 'amber', label: 'Amber Gold', hex: '#f59e0b' },
  { id: 'purple', label: 'Electric Purple', hex: '#a855f7' },
  { id: 'pink', label: 'Hot Pink', hex: '#ec4899' },
  { id: 'white', label: 'Pure White', hex: '#f8fafc' },
];

interface TrackHUDProps {
  metrics: TrackMetrics;
  closeLoop: boolean;
  onToggleCloseLoop: () => void;
  closeDrawnLoop: boolean;
  onToggleCloseDrawnLoop: () => void;
  snapGrid: number;
  onChangeSnapGrid: (val: number) => void;
  droneSpeedKmH: number;
  onChangeDroneSpeed: (speed: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitField: () => void;
  onResetView?: () => void;
  isDrawMode: boolean;
  onToggleDrawMode: () => void;
  hasDrawnPath: boolean;
  onClearDrawnPath: () => void;
  onSmoothDrawnPath: () => void;
  onGenerateCurveFromGates: () => void;
  onUndoLastStroke?: () => void;
  canUndoStroke?: boolean;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  showDistances: boolean;
  onToggleShowDistances: () => void;
  drawnPathColor: string;
  onChangeDrawnPathColor: (color: string) => void;
  itemCount?: number;
  onRotateAllYaw?: (deltaDeg: number, rotatePositions: boolean) => void;
  onSetAllYaw?: (targetYawDeg: number) => void;
}

export const TrackHUD: React.FC<TrackHUDProps> = ({
  metrics,
  closeLoop,
  onToggleCloseLoop,
  closeDrawnLoop,
  onToggleCloseDrawnLoop,
  snapGrid,
  onChangeSnapGrid,
  droneSpeedKmH,
  onChangeDroneSpeed,
  onZoomIn,
  onZoomOut,
  onFitField,
  isDrawMode,
  onToggleDrawMode,
  hasDrawnPath,
  onClearDrawnPath,
  onSmoothDrawnPath,
  onGenerateCurveFromGates,
  onUndoLastStroke,
  canUndoStroke,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  showDistances,
  onToggleShowDistances,
  drawnPathColor,
  onChangeDrawnPathColor,
  itemCount = 0,
  onRotateAllYaw,
  onSetAllYaw,
}) => {
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const [showYawPopover, setShowYawPopover] = React.useState(false);
  const [hudRotateMode, setHudRotateMode] = React.useState<'heading' | 'orbit'>('heading');
  // Phone layout: tool buttons fold away behind a toggle so the field stays visible
  const [showMobileTools, setShowMobileTools] = React.useState(false);

  return (
    <>
      {/* Top Telemetry Header Bar */}
      <div
        id="track-hud-top"
        className="absolute top-3 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-none compact:top-2 compact:left-14 compact:right-2 compact:gap-2 compact:flex-wrap compact:items-start"
      >
        {/* Left Telemetry Cluster */}
        <div className="flex items-center gap-2 pointer-events-auto bg-tg-panel/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800 shadow-xl font-mono compact:flex-1 compact:min-w-0 compact:h-10 compact:gap-0 compact:px-2 compact:py-0 compact:overflow-x-auto no-scrollbar">
          {/* Total Track Distance */}
          <div className="flex items-center gap-2 pr-3 border-r border-slate-800 compact:pr-2 compact:gap-1.5 shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${hasDrawnPath ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-sky-400'} animate-pulse`} />
            <div>
              <div className="text-[10px] compact:text-[9px] text-slate-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
                <span>Total Length</span>
                {hasDrawnPath && (
                  <span className="text-[9px] text-emerald-300 bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-500/40">
                    Drawn
                  </span>
                )}
              </div>
              <div className={`text-base font-bold ${hasDrawnPath ? 'text-emerald-300' : 'text-cyan-300'}`}>
                {metrics.totalDistance.toFixed(1)} <span className="text-xs text-slate-400">m</span>
              </div>
            </div>
          </div>

          {/* Waypoints Count */}
          <div className="px-3 border-r border-slate-800 compact:px-2 shrink-0">
            <div className="text-[10px] compact:text-[9px] text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Waypoints
            </div>
            <div className="text-base compact:text-sm compact:leading-tight font-bold text-slate-100">
              {metrics.gateCount} <span className="text-xs text-slate-400 compact:hidden">gates</span>
            </div>
          </div>

          {/* Estimated Lap Time */}
          <div className="px-3 border-r border-slate-800 compact:px-2 shrink-0">
            <div className="text-[10px] compact:text-[9px] text-slate-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
              <Gauge className="w-2.5 h-2.5 text-emerald-400" />
              Est. Lap Time
            </div>
            <div className="text-base compact:text-sm compact:leading-tight font-bold text-emerald-400">
              {metrics.estimatedLapTime.toFixed(1)} <span className="text-xs text-slate-400">s</span>
            </div>
          </div>

          {/* Speed Selector */}
          <div className="pl-1 compact:pl-2 shrink-0">
            <div className="text-[10px] compact:text-[9px] text-slate-400 uppercase tracking-wider whitespace-nowrap">
              Speed
            </div>
            <select
              id="select-drone-speed"
              value={droneSpeedKmH}
              onChange={(e) => onChangeDroneSpeed(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-sky-300 text-xs rounded px-1.5 py-0.5 font-mono focus:outline-none focus:border-sky-500"
            >
              <option value={25}>25 km/h (Training)</option>
              <option value={60}>60 km/h (Slow)</option>
              <option value={85}>85 km/h (Pro)</option>
              <option value={100}>100 km/h (Fast)</option>
              <option value={120}>120 km/h (Rocket)</option>
            </select>
          </div>
        </div>

        {/* Phone layout: show / hide the tool buttons */}
        <button
          type="button"
          onClick={() => setShowMobileTools((v) => !v)}
          className={`hidden compact:flex pointer-events-auto shrink-0 w-10 h-10 items-center justify-center rounded-xl border shadow-xl ${
            showMobileTools || isDrawMode
              ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
              : 'bg-tg-panel/95 border-slate-700 text-slate-300'
          }`}
          aria-label={showMobileTools ? 'Hide tools' : 'Show tools'}
        >
          {showMobileTools ? <X className="w-5 h-5" /> : <SlidersHorizontal className="w-5 h-5" />}
        </button>

        {/* Right Controls Cluster */}
        <div className={`flex flex-wrap max-w-full items-center gap-2 pointer-events-auto bg-tg-panel/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-xl font-mono text-xs ${
          showMobileTools ? 'compact:basis-full compact:gap-1.5 compact:px-1.5' : 'compact:hidden'
        }`}>
          {/* Draw Flight Path Toggle Button */}
          <button
            id="btn-toggle-draw-mode"
            onClick={onToggleDrawMode}
            className={`px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 shadow-sm ${
              isDrawMode
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-amber-500/20'
                : hasDrawnPath
                ? 'bg-emerald-950/70 border-emerald-400 text-emerald-300 hover:bg-emerald-900/60'
                : 'bg-slate-900 border-slate-700 text-sky-300 hover:border-sky-400 hover:text-white'
            }`}
            title="Draw racing flight path directly on the field (press D to toggle)"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{isDrawMode ? 'Drawing...' : hasDrawnPath ? 'Edit Drawn Line' : 'Draw Track Line'}</span>
          </button>

          {/* Close Loop Toggle */}
          <button
            id="btn-toggle-loop"
            onClick={hasDrawnPath ? onToggleCloseDrawnLoop : onToggleCloseLoop}
            className={`px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
              (hasDrawnPath ? closeDrawnLoop : closeLoop)
                ? 'bg-sky-950/70 border-sky-400 text-sky-300 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={
              hasDrawnPath
                ? closeDrawnLoop
                  ? 'Drawn Track: Closed Circuit (Loop connects end to start)'
                  : 'Drawn Track: Open Track (Stops where you finished drawing)'
                : closeLoop
                ? 'Gate Sequence: Closed Circuit (Loop)'
                : 'Gate Sequence: Sprint (Open)'
            }
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>
              {(hasDrawnPath ? closeDrawnLoop : closeLoop)
                ? 'Circuit (Loop)'
                : 'Open Track'}
            </span>
          </button>

          {/* Show / Hide Distance Labels Toggle */}
          <button
            id="btn-toggle-distances"
            onClick={onToggleShowDistances}
            className={`px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
              showDistances
                ? 'bg-sky-950/70 border-sky-400 text-sky-300 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
            title="Show or hide distance labels between gates"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>{showDistances ? 'Dist: ON' : 'Dist: OFF'}</span>
          </button>

          {/* Line Color Picker */}
          <div className="relative">
            <button
              id="btn-toggle-line-color"
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="px-2 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 transition flex items-center gap-1.5"
              title="Change drawing line color"
            >
              <Palette className="w-3.5 h-3.5 text-slate-300" />
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-sm"
                style={{ backgroundColor: drawnPathColor }}
              />
            </button>
            {showColorPicker && (
              <div className="absolute top-10 right-0 z-40 bg-tg-panel border border-slate-700 rounded-xl p-2 shadow-2xl flex items-center gap-1.5">
                {TRACK_LINE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onChangeDrawnPathColor(c.hex);
                      setShowColorPicker(false);
                    }}
                    className={`w-5 h-5 rounded-full border-2 transition transform hover:scale-110 ${
                      drawnPathColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-transparent opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Snap Grid Toggle */}
          <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
            <Grid className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-[11px]">Snap:</span>
            <button
              onClick={() => onChangeSnapGrid(0)}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                snapGrid === 0 ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Off
            </button>
            <button
              onClick={() => onChangeSnapGrid(0.5)}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                snapGrid === 0.5 ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              0.5m
            </button>
            <button
              onClick={() => onChangeSnapGrid(1.0)}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                snapGrid === 1.0 ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1.0m
            </button>
          </div>

          {/* Quick Yaw Rotate All Toolbar Action */}
          {onRotateAllYaw && (
            <div className="relative">
              <button
                id="btn-hud-yaw-all"
                onClick={() => setShowYawPopover(!showYawPopover)}
                className={`px-2 py-1.5 rounded-lg border transition flex items-center gap-1.5 text-xs font-mono ${
                  showYawPopover
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-amber-300 hover:bg-slate-800'
                }`}
                title="Yaw Rotate All Equipment on field"
              >
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>Yaw: All</span>
              </button>

              {showYawPopover && (
                <div className="absolute top-10 right-0 z-40 w-64 bg-tg-panel/95 backdrop-blur-md border border-slate-700 rounded-xl p-3 shadow-2xl font-mono text-xs text-slate-200 space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                    <span className="font-bold text-amber-400 flex items-center gap-1">
                      <Compass className="w-3 h-3 text-amber-400" />
                      Yaw Rotate All ({itemCount})
                    </span>
                    <button
                      onClick={() => setShowYawPopover(false)}
                      className="text-slate-500 hover:text-slate-300 text-[10px]"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Mode */}
                  <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px]">
                    <button
                      onClick={() => setHudRotateMode('heading')}
                      className={`py-0.5 rounded text-center transition ${
                        hudRotateMode === 'heading'
                          ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Rotate item facing headings in-place"
                    >
                      In-Place (Facing)
                    </button>
                    <button
                      onClick={() => setHudRotateMode('orbit')}
                      className={`py-0.5 rounded text-center transition ${
                        hudRotateMode === 'orbit'
                          ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Orbit track around center"
                    >
                      Track Orbit
                    </button>
                  </div>

                  {/* Steps */}
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      onClick={() => onRotateAllYaw(-90, hudRotateMode === 'orbit')}
                      disabled={itemCount === 0}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] transition text-center disabled:opacity-40"
                    >
                      -90°
                    </button>
                    <button
                      onClick={() => onRotateAllYaw(-15, hudRotateMode === 'orbit')}
                      disabled={itemCount === 0}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold border border-slate-700 text-[10px] transition text-center disabled:opacity-40"
                    >
                      ↺ -15°
                    </button>
                    <button
                      onClick={() => onRotateAllYaw(15, hudRotateMode === 'orbit')}
                      disabled={itemCount === 0}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold border border-slate-700 text-[10px] transition text-center disabled:opacity-40"
                    >
                      +15° ↻
                    </button>
                    <button
                      onClick={() => onRotateAllYaw(90, hudRotateMode === 'orbit')}
                      disabled={itemCount === 0}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] transition text-center disabled:opacity-40"
                    >
                      +90°
                    </button>
                  </div>

                  {/* Invert & Cardinal Facing */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onRotateAllYaw(180, hudRotateMode === 'orbit')}
                      disabled={itemCount === 0}
                      className="flex-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] transition disabled:opacity-40"
                    >
                      180° Flip
                    </button>
                    {[0, 90, 180, 270].map((deg) => (
                      <button
                        key={deg}
                        onClick={() => onSetAllYaw?.(deg)}
                        disabled={itemCount === 0}
                        className="px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-[9px] transition disabled:opacity-40"
                        title={`Set all to ${deg}°`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Global Undo & Redo Controls */}
          <div className="flex items-center gap-0.5 bg-slate-900 px-1 py-1 rounded-lg border border-slate-800">
            <button
              id="btn-undo-global"
              onClick={onUndo}
              disabled={!canUndo}
              className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition disabled:opacity-25 disabled:pointer-events-none flex items-center gap-1 text-xs"
              title="Undo last action (Ctrl+Z / Cmd+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              id="btn-redo-global"
              onClick={onRedo}
              disabled={!canRedo}
              className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition disabled:opacity-25 disabled:pointer-events-none flex items-center gap-1 text-xs"
              title="Redo action (Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Redo</span>
            </button>
          </div>

          {/* Viewport Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-900 px-1 py-1 rounded-lg border border-slate-800">
            <button
              id="btn-zoom-in"
              onClick={onZoomIn}
              className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-zoom-out"
              onClick={onZoomOut}
              className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-fit-field"
              onClick={onFitField}
              className="p-1 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded transition"
              title={`Fit ${FIELD_WIDTH_M}m × ${FIELD_HEIGHT_M}m Field to Screen`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Shortcut / Help Tooltip Toggle */}
          <button
            id="btn-help-shortcuts"
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg transition"
            title="Keyboard shortcuts & controls"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Floating Draw Mode Toolbar (Visible when in Draw Track Line mode) */}
      {isDrawMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-tg-panel/95 backdrop-blur-md border border-amber-500/60 text-slate-200 px-4 py-2 rounded-xl shadow-2xl font-mono text-xs flex flex-wrap items-center gap-3 compact:top-auto compact:bottom-14 compact:left-2 compact:right-2 compact:translate-x-0 compact:px-2.5 compact:gap-2 compact:justify-center">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-800 text-amber-300 font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>
              {hasDrawnPath
                ? 'Line Paused · Click & Hold anywhere to continue where you stopped'
                : 'Draw Mode · Click & drag on field to trace track'}
            </span>
          </div>

          {/* Loop / Open Track Toggle for Drawn Line */}
          {hasDrawnPath && (
            <button
              id="btn-drawn-loop-toggle"
              onClick={onToggleCloseDrawnLoop}
              className={`px-2.5 py-1 rounded border transition flex items-center gap-1.5 ${
                closeDrawnLoop
                  ? 'bg-emerald-950/70 border-emerald-400 text-emerald-300 font-bold'
                  : 'bg-slate-900 border-slate-700 hover:border-slate-500 text-slate-300'
              }`}
              title="Toggle between Open Track (stops at finish) and Closed Circuit (loops back to start)"
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>{closeDrawnLoop ? 'Closed Loop' : 'Open Track'}</span>
            </button>
          )}

          {/* Color Palette Chips */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 rounded-lg border border-slate-800">
            <Palette className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] text-slate-400">Color:</span>
            {TRACK_LINE_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => onChangeDrawnPathColor(c.hex)}
                className={`w-4 h-4 rounded-full border transition transform ${
                  drawnPathColor.toLowerCase() === c.hex.toLowerCase()
                    ? 'border-white scale-125 ring-2 ring-white/30'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.label}
              />
            ))}
          </div>

          {/* Smoothing Button */}
          {hasDrawnPath && (
            <button
              id="btn-smooth-line"
              onClick={onSmoothDrawnPath}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 hover:border-cyan-400 hover:text-cyan-300 text-slate-300 transition flex items-center gap-1.5"
              title="Apply aerodynamic curvature smoothing"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Smooth Line</span>
            </button>
          )}

          {/* Auto-Curve from Gates button */}
          <button
            id="btn-auto-curve-gates"
            onClick={onGenerateCurveFromGates}
            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 hover:border-sky-400 hover:text-sky-300 text-slate-300 transition flex items-center gap-1.5"
            title="Automatically generate a smooth racing curve through sequential gates and orbit flag poles"
          >
            <Wand2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Auto Curve from Gates</span>
          </button>

          {/* Undo button */}
          <button
            id="btn-undo-stroke"
            onClick={onUndo}
            disabled={!canUndo}
            className="px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 transition flex items-center gap-1 disabled:opacity-25 disabled:pointer-events-none"
            title="Undo last stroke or action (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          {/* Redo button */}
          <button
            id="btn-redo-stroke"
            onClick={onRedo}
            disabled={!canRedo}
            className="px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 transition flex items-center gap-1 disabled:opacity-25 disabled:pointer-events-none"
            title="Redo stroke or action (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span>Redo</span>
          </button>

          {/* Clear Line button */}
          {hasDrawnPath && (
            <button
              id="btn-clear-drawn-line"
              onClick={onClearDrawnPath}
              className="px-2 py-1 rounded bg-rose-950/40 border border-rose-800/80 hover:bg-rose-900/60 text-rose-300 transition flex items-center gap-1"
              title="Clear drawn line"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Line</span>
            </button>
          )}

          {/* Done Button */}
          <button
            id="btn-finish-drawing"
            onClick={onToggleDrawMode}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1 shadow-md shadow-emerald-600/30"
            title="Done drawing (Esc or D)"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>
        </div>
      )}

      {/* Shortcuts Popover */}
      {showShortcuts && (
        <div className="absolute top-16 right-4 z-30 w-72 compact:left-2 compact:right-2 compact:w-auto compact:max-h-[70%] compact:overflow-y-auto bg-tg-panel/95 backdrop-blur-md border border-slate-700 rounded-xl p-3.5 shadow-2xl text-xs font-mono text-slate-300">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 font-bold text-sky-400 uppercase">
            <span>Controls & Shortcuts</span>
            <button
              onClick={() => setShowShortcuts(false)}
              className="text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          </div>
          <div className="mt-2.5 space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Draw Track Line (Pen):</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-amber-300">D</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-300 font-semibold">Undo Action:</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-emerald-300">Ctrl + Z</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-300 font-semibold">Redo Action:</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-emerald-300">Ctrl + Y / Shift+Z</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Rotate Item +15° (Yaw):</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-sky-300">R</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Rotate Item -15° (Yaw):</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-sky-300">Shift + R</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Gate Pitch (Tilt):</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-sky-300">P / Shift + P</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Gate Roll (Bank):</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-sky-300">O / Shift + O</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-300 font-semibold">Yaw Rotate All Items:</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-amber-300">Alt + R (±15°)</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Mirror Gate (Flip):</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-sky-300">M</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Delete Item:</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-rose-300">Del / Backspace</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Pan View:</span>
              <span className="text-slate-300">Hold Space + Drag or Right-Click Drag</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Zoom:</span>
              <span className="text-slate-300">Mouse Scroll Wheel</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Deselect / Cancel:</span>
              <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">Escape</kbd>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Field Dimensions / Safety Status Pill */}
      <div className="absolute bottom-3 left-4 z-10 pointer-events-none flex items-center gap-3 compact:hidden">
        <div className="bg-tg-panel/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 shadow-lg font-mono text-[11px] text-slate-400 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Field: <strong className="text-slate-200">{FIELD_WIDTH_M}m × {FIELD_HEIGHT_M}m</strong></span>
          <span className="text-slate-600">|</span>
          <span>Perimeter Buffer: <strong className="text-amber-400">3.0m Safety Fence</strong></span>
        </div>

        {metrics.longestStraight > 0 && (
          <div className="hidden sm:flex bg-tg-panel/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 shadow-lg font-mono text-[11px] text-slate-400 items-center gap-2">
            <span>Longest Run: <strong className="text-sky-400">{metrics.longestStraight.toFixed(1)}m</strong></span>
            <span className="text-slate-600">|</span>
            <span>Shortest Gap: <strong className="text-amber-300">{metrics.shortestSegment.toFixed(1)}m</strong></span>
          </div>
        )}
      </div>
    </>
  );
};
