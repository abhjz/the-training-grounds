import React, { useEffect, useRef, useState, useCallback, useMemo, Suspense, lazy } from 'react';
import { Box, Compass, Map as MapIcon, Menu } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { TrackHUD } from './components/TrackHUD';
import { ItemInspector } from './components/ItemInspector';
import { SaveLoadModal } from './components/SaveLoadModal';
import { PlacedItem, SavedTrack, TrackPoint } from './types';
import {
  EQUIPMENT_INVENTORY,
  EQUIPMENT_MAP,
  FIELD_HEIGHT_M,
  FIELD_WIDTH_M,
  setActiveGround,
} from './constants/equipment';
import { PRESET_TRACKS } from './constants/presets';
import { drawFieldScene, ViewportTransform } from './utils/canvasRenderer';
import {
  calculatePathAndMetrics,
  calculateDrawnPathMetrics,
  smoothPathPoints,
  generateCurvedPathFromGates,
  hitTestItem,
  hitTestRotationHandle,
  hitTestManeuverBadge,
  hitTestManeuverRotateHandle,
  getManeuverBadgeLayout,
  isInsideFence,
  snapCoord,
} from './utils/trackMath';
import { AutosaveState, deleteAutosave, loadAutosave, writeAutosave } from './utils/autosave';
import type { Export3DKind, Export3DRequest } from './components/SceneExporter';
import {
  CustomEquipmentInput,
  groundsUsing,
  loadCustomEquipment,
  makeCustomDef,
  registerCustomEquipment,
  saveCustomEquipment,
} from './utils/customEquipment';
import { parseTrackText } from './utils/trackExporter';
import { listenForIncomingTrackFiles } from './utils/incomingTrackFile';
import { ThemePicker } from './components/ThemePicker';
import { applyTheme, loadThemeId } from './theme/engine';
import { PALETTES } from './theme/palettes';
import {
  DEFAULT_GROUND,
  Ground,
  loadActiveGroundId,
  loadGrounds,
  newGroundId,
  saveActiveGroundId,
  saveGrounds,
} from './utils/grounds';

// Custom equipment made in the app joins the inventory before anything renders
registerCustomEquipment(loadCustomEquipment());

// 3D view is loaded on demand so the 2D editor stays fast to open
const Field3D = lazy(() => import('./components/Field3D'));

interface HistorySnapshot {
  items: PlacedItem[];
  drawnPath: TrackPoint[];
}

export default function App() {
  // Colour theme (applied to the page in main.tsx and on change)
  const [themeId, setThemeId] = useState<string>(() => loadThemeId());
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const handleSelectTheme = useCallback((id: string) => {
    applyTheme(id);
    setThemeId(id);
  }, []);
  // Phone layout: inventory sidebar is a slide-in drawer
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  // Grounds (venues) — each has its own size and autosaved layout
  const [grounds, setGrounds] = useState<Ground[]>(() => loadGrounds());
  const [activeGroundId, setActiveGroundId] = useState<string>(() => loadActiveGroundId(grounds));
  const activeGround = grounds.find((g) => g.id === activeGroundId) ?? DEFAULT_GROUND;
  // Keep the shared field size in step with the active ground before anything below renders
  setActiveGround(activeGround);

  // Restore the last autosaved layout once; the original ground falls back to the Championship preset
  const [restored] = useState<AutosaveState | null>(() => loadAutosave(activeGroundId));

  // Placed equipment items on the field
  const [items, setItems] = useState<PlacedItem[]>(
    () => restored?.items ?? (activeGroundId === DEFAULT_GROUND.id ? PRESET_TRACKS[0].items : [])
  );

  // Undo & Redo History stacks
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  // Selection & interaction states
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [placingEquipId, setPlacingEquipId] = useState<string | null>(null);

  // Track settings
  const [closeLoop, setCloseLoop] = useState<boolean>(restored?.closeLoop ?? true);
  const [closeDrawnLoop, setCloseDrawnLoop] = useState<boolean>(restored?.closeDrawnLoop ?? false);
  const [droneSpeedKmH, setDroneSpeedKmH] = useState<number>(restored?.droneSpeedKmH ?? 85);
  const [snapGrid, setSnapGrid] = useState<number>(restored?.snapGrid ?? 0.5); // 0.5m grid snap by default

  // Custom Track Path Drawing State
  const [drawnPath, setDrawnPath] = useState<TrackPoint[]>(restored?.drawnPath ?? []);
  const [activeStroke, setActiveStroke] = useState<TrackPoint[]>([]);
  const [isDrawMode, setIsDrawMode] = useState<boolean>(false);
  const [isDrawingStroke, setIsDrawingStroke] = useState<boolean>(false);
  const [showDistances, setShowDistances] = useState<boolean>(restored?.showDistances ?? true);
  const [drawnPathColor, setDrawnPathColor] = useState<string>(restored?.drawnPathColor ?? '#ef4444');
  const [viewMode, setViewMode] = useState<'2d' | '3d'>(() => {
    try {
      // 3D is the default; only stay in 2D if the user last chose it
      return localStorage.getItem('training_grounds_view_mode') === '2d' ? '2d' : '3d';
    } catch {
      return '3d';
    }
  });
  const switchViewMode = (mode: '2d' | '3d') => {
    setViewMode(mode);
    try {
      localStorage.setItem('training_grounds_view_mode', mode);
    } catch {}
    if (mode === '3d') {
      // Freehand drawing is a 2D-map tool (placing works in both views)
      setIsDrawMode(false);
    }
  };
  const isDrawingStrokeRef = useRef(false);
  const activeStrokeRef = useRef<TrackPoint[]>([]);

  // Synchronous state refs for history tracking
  const itemsRef = useRef<PlacedItem[]>(items);
  itemsRef.current = items;
  const drawnPathRef = useRef<TrackPoint[]>(drawnPath);
  drawnPathRef.current = drawnPath;

  const dragStartSnapshotRef = useRef<HistorySnapshot | null>(null);

  // --- Drag-to-move from the 3D view (same snapping and undo behaviour as the 2D map) ---
  const handle3DMoveStart = useCallback((id: string) => {
    dragStartSnapshotRef.current = {
      items: JSON.parse(JSON.stringify(itemsRef.current)),
      drawnPath: JSON.parse(JSON.stringify(drawnPathRef.current)),
    };
    setSelectedItemId(id);
  }, []);
  const snapGridRef = useRef(snapGrid);
  snapGridRef.current = snapGrid;
  const handle3DMove = useCallback((id: string, x: number, y: number) => {
    const sx = snapCoord(x, snapGridRef.current, FIELD_WIDTH_M);
    const sy = snapCoord(y, snapGridRef.current, FIELD_HEIGHT_M);
    setItems((prev) => prev.map((it) => (it.id === id && (it.x !== sx || it.y !== sy) ? { ...it, x: sx, y: sy } : it)));
  }, []);
  // --- Race line editing from the 3D view ---
  const handlePathEditStart = useCallback(() => {
    dragStartSnapshotRef.current = {
      items: JSON.parse(JSON.stringify(itemsRef.current)),
      drawnPath: JSON.parse(JSON.stringify(drawnPathRef.current)),
    };
  }, []);
  const handlePathChange = useCallback((path: TrackPoint[]) => {
    drawnPathRef.current = path; // keep the ref current so an immediate edit-end sees the change
    setDrawnPath(path);
  }, []);
  const handlePathEditEnd = useCallback(() => {
    const snap = dragStartSnapshotRef.current;
    dragStartSnapshotRef.current = null;
    if (snap && JSON.stringify(snap.drawnPath) !== JSON.stringify(drawnPathRef.current)) {
      setUndoStack((prev) => [...prev.slice(-40), snap]);
      setRedoStack([]);
    }
  }, []);
  const handle3DMoveEnd = useCallback(() => {
    const snap = dragStartSnapshotRef.current;
    dragStartSnapshotRef.current = null;
    if (snap && JSON.stringify(snap.items) !== JSON.stringify(itemsRef.current)) {
      setUndoStack((prev) => [...prev.slice(-40), snap]);
      setRedoStack([]);
    }
  }, []);

  // Autosave the working layout (debounced so drags don't write on every mouse move)
  const autosaveState: AutosaveState = useMemo(
    () => ({ items, drawnPath, closeLoop, closeDrawnLoop, droneSpeedKmH, snapGrid, showDistances, drawnPathColor }),
    [items, drawnPath, closeLoop, closeDrawnLoop, droneSpeedKmH, snapGrid, showDistances, drawnPathColor]
  );
  const latestAutosaveRef = useRef(autosaveState);
  latestAutosaveRef.current = autosaveState;
  const activeGroundIdRef = useRef(activeGroundId);
  activeGroundIdRef.current = activeGroundId;
  useEffect(() => {
    const t = window.setTimeout(() => writeAutosave(autosaveState, activeGroundId), 400);
    return () => window.clearTimeout(t);
  }, [autosaveState, activeGroundId]);
  useEffect(() => {
    // Flush immediately when the tab is hidden or closed, so the last edit isn't lost
    const flush = () => writeAutosave(latestAutosaveRef.current, activeGroundIdRef.current);
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ---- Switching, creating and deleting grounds ----
  const switchGround = useCallback(
    (ground: Ground) => {
      if (ground.id === activeGroundIdRef.current) return;
      // Save the ground we're leaving right away (the debounced save may not have run yet)
      writeAutosave(latestAutosaveRef.current, activeGroundIdRef.current);
      setActiveGround(ground);
      const saved = loadAutosave(ground.id);
      const nextItems = saved?.items ?? (ground.id === DEFAULT_GROUND.id ? PRESET_TRACKS[0].items : []);
      const nextPath = saved?.drawnPath ?? [];
      itemsRef.current = nextItems;
      drawnPathRef.current = nextPath;
      setItems(nextItems);
      setDrawnPath(nextPath);
      setCloseLoop(saved?.closeLoop ?? true);
      setCloseDrawnLoop(saved?.closeDrawnLoop ?? false);
      setDroneSpeedKmH(saved?.droneSpeedKmH ?? 85);
      setSnapGrid(saved?.snapGrid ?? 0.5);
      setShowDistances(saved?.showDistances ?? true);
      setDrawnPathColor(saved?.drawnPathColor ?? '#ef4444');
      // Undo history and selections belong to the ground we left
      setUndoStack([]);
      setRedoStack([]);
      setSelectedItemId(null);
      setPlacingEquipId(null);
      setIsDrawMode(false);
      activeStrokeRef.current = [];
      setActiveStroke([]);
      activeGroundIdRef.current = ground.id;
      setActiveGroundId(ground.id);
      saveActiveGroundId(ground.id);
    },
    []
  );
  const handleCreateGround = useCallback(
    (name: string, width: number, height: number) => {
      const ground: Ground = { id: newGroundId(), name: name.trim(), width, height };
      setGrounds((prev) => {
        const next = [...prev, ground];
        saveGrounds(next);
        return next;
      });
      switchGround(ground);
    },
    [switchGround]
  );
  const handleDeleteGround = useCallback((id: string) => {
    if (id === DEFAULT_GROUND.id || id === activeGroundIdRef.current) return;
    setGrounds((prev) => {
      const next = prev.filter((g) => g.id !== id);
      saveGrounds(next);
      return next;
    });
    deleteAutosave(id);
  }, []);

  const isPerformingUndoRedoRef = useRef<boolean>(false);
  const lastDebouncedHistoryTimeRef = useRef<number>(0);

  // Record a new state snapshot onto undo stack & clear redo stack
  const recordHistory = useCallback(() => {
    if (isPerformingUndoRedoRef.current) return;
    const snapshot: HistorySnapshot = {
      items: JSON.parse(JSON.stringify(itemsRef.current)),
      drawnPath: JSON.parse(JSON.stringify(drawnPathRef.current)),
    };
    setUndoStack((prev) => [...prev.slice(-40), snapshot]);
    setRedoStack([]);
  }, []);

  // Debounced history record for rapid adjustments (sliders, keyboard holding)
  const recordHistoryDebounced = useCallback((minIntervalMs = 350) => {
    if (isPerformingUndoRedoRef.current) return;
    const now = Date.now();
    if (now - lastDebouncedHistoryTimeRef.current > minIntervalMs) {
      recordHistory();
      lastDebouncedHistoryTimeRef.current = now;
    }
  }, [recordHistory]);

  // Perform Undo
  const handleUndo = useCallback(() => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previousSnapshot = prevUndo[prevUndo.length - 1];
      const newUndoStack = prevUndo.slice(0, -1);

      const currentSnapshot: HistorySnapshot = {
        items: JSON.parse(JSON.stringify(itemsRef.current)),
        drawnPath: JSON.parse(JSON.stringify(drawnPathRef.current)),
      };
      setRedoStack((prevRedo) => [...prevRedo.slice(-40), currentSnapshot]);

      isPerformingUndoRedoRef.current = true;
      itemsRef.current = previousSnapshot.items;
      drawnPathRef.current = previousSnapshot.drawnPath;
      setItems(previousSnapshot.items);
      setDrawnPath(previousSnapshot.drawnPath);
      setSelectedItemId((prevId) => {
        if (!prevId) return null;
        return previousSnapshot.items.some((it) => it.id === prevId) ? prevId : null;
      });

      setTimeout(() => {
        isPerformingUndoRedoRef.current = false;
      }, 0);

      return newUndoStack;
    });
  }, []);

  // Perform Redo
  const handleRedo = useCallback(() => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextSnapshot = prevRedo[prevRedo.length - 1];
      const newRedoStack = prevRedo.slice(0, -1);

      const currentSnapshot: HistorySnapshot = {
        items: JSON.parse(JSON.stringify(itemsRef.current)),
        drawnPath: JSON.parse(JSON.stringify(drawnPathRef.current)),
      };
      setUndoStack((prevUndo) => [...prevUndo.slice(-40), currentSnapshot]);

      isPerformingUndoRedoRef.current = true;
      itemsRef.current = nextSnapshot.items;
      drawnPathRef.current = nextSnapshot.drawnPath;
      setItems(nextSnapshot.items);
      setDrawnPath(nextSnapshot.drawnPath);
      setSelectedItemId((prevId) => {
        if (!prevId) return null;
        return nextSnapshot.items.some((it) => it.id === prevId) ? prevId : null;
      });

      setTimeout(() => {
        isPerformingUndoRedoRef.current = false;
      }, 0);

      return newRedoStack;
    });
  }, []);

  // Default Equipment Placement Yaw (Spawn orientation for inventory items)
  const [defaultPlacementYaw, setDefaultPlacementYaw] = useState<number>(0);

  // Modals & panels
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  // Canvas Viewport transform (scale = pixels per meter, offset = screen pixels)
  const [viewport, setViewport] = useState<ViewportTransform>({
    scale: 18,
    offsetX: 60,
    offsetY: 60,
  });

  // Mouse & Dragging refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isDraggingItemRef = useRef(false);
  const isRotatingItemRef = useRef(false);
  const isPanningRef = useRef(false);
  const spacePressedRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragItemOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const mouseWorldPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cursorWorldCoords, setCursorWorldCoords] = useState<{ x: number; y: number } | null>(null);

  // Gate rotation state
  const [hoveredGateRotateHandleId, setHoveredGateRotateHandleId] = useState<string | null>(null);
  const [isRotatingGate, setIsRotatingGate] = useState<boolean>(false);

  // Flight Maneuver manual dragging & rotating state & refs
  const [hoveredManeuverItemId, setHoveredManeuverItemId] = useState<string | null>(null);
  const [hoveredManeuverRotateHandleId, setHoveredManeuverRotateHandleId] = useState<string | null>(null);
  const [isDraggingManeuver, setIsDraggingManeuver] = useState<boolean>(false);
  const [isRotatingManeuver, setIsRotatingManeuver] = useState<boolean>(false);
  const isDraggingManeuverRef = useRef<boolean>(false);
  const isRotatingManeuverRef = useRef<boolean>(false);
  const draggingManeuverItemIdRef = useRef<string | null>(null);
  const rotatingManeuverItemIdRef = useRef<string | null>(null);
  const dragManeuverStartRef = useRef<{
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  }>({ startX: 0, startY: 0, origOffsetX: 0, origOffsetY: 0 });

  // Compute flight path segments & metrics in real-time
  const { segments, metrics: baseMetrics } = useMemo(
    () => calculatePathAndMetrics(items, closeLoop, droneSpeedKmH),
    [items, closeLoop, droneSpeedKmH]
  );

  // If user has drawn a custom flight path, use real drawn trajectory metrics!
  const metrics = useMemo(() => {
    if (drawnPath && drawnPath.length >= 2) {
      return calculateDrawnPathMetrics(drawnPath, items, droneSpeedKmH);
    }
    return baseMetrics;
  }, [drawnPath, items, droneSpeedKmH, baseMetrics]);

  // Selected item object
  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  // ---- Custom equipment ----
  const [customEquipment, setCustomEquipment] = useState(() => EQUIPMENT_INVENTORY.filter((e) => e.isCustom));
  const handleCreateEquipment = useCallback((input: CustomEquipmentInput) => {
    const def = makeCustomDef(input);
    setCustomEquipment((prev) => {
      const next = [...prev, def];
      saveCustomEquipment(next);
      registerCustomEquipment(next);
      return next;
    });
    setPlacingEquipId(def.id); // ready to place right away
  }, []);
  const handleDeleteEquipment = useCallback(
    (id: string): string | null => {
      if (itemsRef.current.some((i) => i.equipId === id) || groundsUsing(id) > 0) {
        return 'This item is placed on a ground. Remove it from every ground before deleting it.';
      }
      setCustomEquipment((prev) => {
        const next = prev.filter((d) => d.id !== id);
        saveCustomEquipment(next);
        registerCustomEquipment(next);
        return next;
      });
      if (placingEquipId === id) setPlacingEquipId(null);
      return null;
    },
    [placingEquipId]
  );

  // Stock tracking for duplication capability
  const stockCounts = useMemo(() => {
    const counts = new Map<string, number>();
    EQUIPMENT_INVENTORY.forEach((eq) => counts.set(eq.id, eq.totalStock));
    items.forEach((item) => {
      const cur = counts.get(item.equipId) ?? 0;
      counts.set(item.equipId, Math.max(0, cur - 1));
    });
    return counts;
  }, [items, customEquipment]);

  const canDuplicateSelected = useMemo(() => {
    return selectedItem !== null;
  }, [selectedItem]);

  const maxSequence = useMemo(() => {
    return items.reduce((max, item) => Math.max(max, item.sequenceOrder ?? 0), 0);
  }, [items]);

  // Screen to World coordinates converter
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      const x = (screenX - viewport.offsetX) / viewport.scale;
      const y = (screenY - viewport.offsetY) / viewport.scale;
      return { x, y };
    },
    [viewport]
  );

  // World to Screen coordinates converter
  const worldToScreen = useCallback(
    (worldX: number, worldY: number): { x: number; y: number } => {
      const x = viewport.offsetX + worldX * viewport.scale;
      const y = viewport.offsetY + worldY * viewport.scale;
      return { x, y };
    },
    [viewport]
  );

  // Auto-fit 57m x 43m field to container view
  const fitFieldToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth: w, clientHeight: h } = containerRef.current;
    if (w <= 0 || h <= 0) return;

    const marginX = 80;
    const marginY = 80;
    const availableW = Math.max(100, w - marginX * 2);
    const availableH = Math.max(100, h - marginY * 2);

    const scaleX = availableW / FIELD_WIDTH_M;
    const scaleY = availableH / FIELD_HEIGHT_M;
    const optimalScale = Math.min(scaleX, scaleY);

    const fieldPixelW = FIELD_WIDTH_M * optimalScale;
    const fieldPixelH = FIELD_HEIGHT_M * optimalScale;

    setViewport({
      scale: optimalScale,
      offsetX: Math.round((w - fieldPixelW) / 2),
      offsetY: Math.round((h - fieldPixelH) / 2 + 10), // slight bias down for top HUD
    });
  }, []);

  // Window resize handler & initial fit
  useEffect(() => {
    fitFieldToScreen();
    const handleResize = () => {
      fitFieldToScreen();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitFieldToScreen]);

  // Re-fit the 2D map when the ground (and so the field size) changes
  useEffect(() => {
    fitFieldToScreen();
  }, [activeGroundId, fitFieldToScreen]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    drawFieldScene({
      ctx,
      canvasWidth: w,
      canvasHeight: h,
      viewport,
      items,
      selectedItemId,
      hoveredItemId,
      isRotating: isRotatingItemRef.current,
      closeLoop: drawnPath.length > 0 ? closeDrawnLoop : closeLoop,
      pathSegments: segments,
      drawnPath,
      isDrawing: isDrawingStroke,
      isDrawMode: isDrawMode,
      activeStroke,
      cursorWorld: cursorWorldCoords,
      showDistances,
      drawnPathColor,
      draggingManeuverItemId: draggingManeuverItemIdRef.current,
      hoveredManeuverItemId,
      rotatingManeuverItemId: rotatingManeuverItemIdRef.current,
      hoveredManeuverRotateHandleId,
      isRotatingGate,
      hoveredGateRotateHandleId,
      placingEquipId,
      placementYaw: defaultPlacementYaw,
    });

    ctx.restore();
  }, [
    activeGroundId,
    viewport,
    items,
    selectedItemId,
    hoveredItemId,
    hoveredManeuverItemId,
    hoveredManeuverRotateHandleId,
    isDraggingManeuver,
    isRotatingManeuver,
    isRotatingGate,
    hoveredGateRotateHandleId,
    placingEquipId,
    defaultPlacementYaw,
    closeLoop,
    closeDrawnLoop,
    segments,
    drawnPath,
    isDrawingStroke,
    isDrawMode,
    activeStroke,
    cursorWorldCoords,
    showDistances,
    drawnPathColor,
    themeId,
  ]);

  // Item deletion with clean sequence compaction
  const deleteItem = useCallback((id: string) => {
    if (itemsRef.current.find((i) => i.id === id)?.locked) return; // locked pieces can't be deleted
    recordHistory();
    setItems((prev) => {
      const itemToDelete = prev.find((i) => i.id === id);
      if (!itemToDelete) return prev;

      const delSeq = itemToDelete.sequenceOrder;
      const remaining = prev.filter((i) => i.id !== id);

      // Re-compact sequence numbers so the flight path has no gaps
      if (delSeq !== null) {
        return remaining.map((item) => {
          if (item.sequenceOrder !== null && item.sequenceOrder > delSeq) {
            return { ...item, sequenceOrder: item.sequenceOrder - 1 };
          }
          return item;
        });
      }
      return remaining;
    });
    setSelectedItemId(null);
  }, [recordHistory]);

  // Update item properties
  const updateItem = useCallback((id: string, updates: Partial<PlacedItem>) => {
    const target = itemsRef.current.find((i) => i.id === id);
    if (target?.locked && !('locked' in updates)) {
      // A locked piece keeps its position and orientation; other settings can still change
      const { x, y, rotation, pitch, roll, isMirrored, ...rest } = updates;
      updates = rest;
      if (Object.keys(updates).length === 0) return;
    }
    recordHistoryDebounced();
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, [recordHistoryDebounced]);

  // Batch Yaw Rotation for all equipment inventory on the field
  const handleRotateAllYaw = useCallback(
    (deltaDeg: number, rotatePositions: boolean = false) => {
      if (items.length === 0) return;
      recordHistory();

      setItems((prev) => {
        if (!rotatePositions) {
          // 1. In-place rotation: each item rotates its heading (yaw) at its current location
          return prev.map((item) => {
            if (item.locked) return item;
            const newRot = (item.rotation + deltaDeg + 3600) % 360;
            return {
              ...item,
              rotation: Math.round(newRot),
              maneuverRotation:
                item.maneuverRotation !== undefined
                  ? (item.maneuverRotation + deltaDeg + 3600) % 360
                  : undefined,
            };
          });
        } else {
          // 2. Field orbit rotation: rotate positions (x, y) around field center AND rotate headings
          const cx = FIELD_WIDTH_M / 2;
          const cy = FIELD_HEIGHT_M / 2;
          const rad = (deltaDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          return prev.map((item) => {
            if (item.locked) return item;
            const dx = item.x - cx;
            const dy = item.y - cy;
            let nx = cx + dx * cos - dy * sin;
            let ny = cy + dx * sin + dy * cos;

            // Clamp safely within playable bounds (buffer from perimeter fence)
            nx = Math.max(1.5, Math.min(FIELD_WIDTH_M - 1.5, Number(nx.toFixed(2))));
            ny = Math.max(1.5, Math.min(FIELD_HEIGHT_M - 1.5, Number(ny.toFixed(2))));

            const newRot = (item.rotation + deltaDeg + 3600) % 360;

            let newManeuverOffsetX = item.maneuverOffsetX;
            let newManeuverOffsetY = item.maneuverOffsetY;
            if (item.maneuverOffsetX !== undefined || item.maneuverOffsetY !== undefined) {
              const mox = item.maneuverOffsetX ?? 0;
              const moy = item.maneuverOffsetY ?? 0;
              newManeuverOffsetX = Number((mox * cos - moy * sin).toFixed(2));
              newManeuverOffsetY = Number((mox * sin + moy * cos).toFixed(2));
            }

            return {
              ...item,
              x: nx,
              y: ny,
              rotation: Math.round(newRot),
              maneuverOffsetX: newManeuverOffsetX,
              maneuverOffsetY: newManeuverOffsetY,
              maneuverRotation:
                item.maneuverRotation !== undefined
                  ? (item.maneuverRotation + deltaDeg + 3600) % 360
                  : undefined,
            };
          });
        }
      });

      // If rotating entire track orbit, also rotate custom drawn lines if present
      if (rotatePositions && drawnPath.length > 0) {
        const cx = FIELD_WIDTH_M / 2;
        const cy = FIELD_HEIGHT_M / 2;
        const rad = (deltaDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        setDrawnPath((prev) =>
          prev.map((pt) => {
            const dx = pt.x - cx;
            const dy = pt.y - cy;
            const nx = cx + dx * cos - dy * sin;
            const ny = cy + dx * sin + dy * cos;
            return {
              ...pt,
              x: Number(Math.max(0.5, Math.min(FIELD_WIDTH_M - 0.5, nx)).toFixed(2)),
              y: Number(Math.max(0.5, Math.min(FIELD_HEIGHT_M - 0.5, ny)).toFixed(2)),
            };
          })
        );
      }
    },
    [items.length, drawnPath, recordHistory]
  );

  // Set absolute yaw angle for all placed equipment
  const handleSetAllYaw = useCallback((targetYawDeg: number) => {
    recordHistory();
    const clamped = Math.round(((targetYawDeg % 360) + 360) % 360);
    setItems((prev) =>
      prev.map((item) => (item.locked ? item : { ...item, rotation: clamped }))
    );
  }, [recordHistory]);

  // Keyboard Shortcuts (D for Draw Mode, Ctrl+Z for undo, R to rotate, Delete, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        spacePressedRef.current = true;
      }

      // Toggle Draw Track Line Mode with 'D'
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsDrawMode((prev) => {
          if (!prev) {
            setSelectedItemId(null);
            setPlacingEquipId(null);
          }
          return !prev;
        });
        return;
      }

      // Global Undo with Ctrl+Z or Cmd+Z (without shift)
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Global Redo with Ctrl+Y or Cmd+Y, or Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        ((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey)) ||
        ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        if (e.altKey) {
          // Alt+R or Alt+Shift+R: Rotate ALL equipment inventory on field
          e.preventDefault();
          const delta = e.shiftKey ? -15 : 15;
          handleRotateAllYaw(delta, false);
        } else if (placingEquipId) {
          // Rotate placement yaw
          e.preventDefault();
          const delta = e.shiftKey ? -15 : 15;
          setDefaultPlacementYaw((prev) => (prev + delta + 360) % 360);
        } else if (selectedItemId) {
          e.preventDefault();
          recordHistoryDebounced();
          const delta = e.shiftKey ? -15 : 15;
          setItems((prev) =>
            prev.map((item) => {
              if (item.id === selectedItemId && !item.locked) {
                let rot = (item.rotation + delta) % 360;
                if (rot < 0) rot += 360;
                return { ...item, rotation: rot };
              }
              return item;
            })
          );
        }
      }

      // Fine yaw rotation using [ and ]
      if (e.key === '[' || e.key === '{') {
        if (selectedItemId) {
          e.preventDefault();
          recordHistoryDebounced();
          const delta = e.shiftKey ? -1 : -5;
          setItems((prev) =>
            prev.map((item) => {
              if (item.id === selectedItemId && !item.locked) {
                let rot = (item.rotation + delta) % 360;
                if (rot < 0) rot += 360;
                return { ...item, rotation: rot };
              }
              return item;
            })
          );
        } else if (placingEquipId) {
          e.preventDefault();
          const delta = e.shiftKey ? -1 : -5;
          setDefaultPlacementYaw((prev) => (prev + delta + 360) % 360);
        }
      }

      if (e.key === ']' || e.key === '}') {
        if (selectedItemId) {
          e.preventDefault();
          recordHistoryDebounced();
          const delta = e.shiftKey ? 1 : 5;
          setItems((prev) =>
            prev.map((item) => {
              if (item.id === selectedItemId && !item.locked) {
                let rot = (item.rotation + delta) % 360;
                if (rot < 0) rot += 360;
                return { ...item, rotation: rot };
              }
              return item;
            })
          );
        } else if (placingEquipId) {
          e.preventDefault();
          const delta = e.shiftKey ? 1 : 5;
          setDefaultPlacementYaw((prev) => (prev + delta + 360) % 360);
        }
      }

      // Pitch rotation with P / Shift+P
      if (e.key === 'p' || e.key === 'P') {
        if (selectedItemId) {
          e.preventDefault();
          recordHistoryDebounced();
          const delta = e.shiftKey ? 15 : -15;
          setItems((prev) =>
            prev.map((item) => {
              if (item.id === selectedItemId && !item.locked) {
                const cur = item.pitch ?? 0;
                const next = Math.max(-85, Math.min(85, cur + delta));
                return { ...item, pitch: next };
              }
              return item;
            })
          );
        }
      }

      // Roll rotation with O / Shift+O
      if (e.key === 'o' || e.key === 'O') {
        if (selectedItemId) {
          e.preventDefault();
          recordHistoryDebounced();
          const delta = e.shiftKey ? 15 : -15;
          setItems((prev) =>
            prev.map((item) => {
              if (item.id === selectedItemId && !item.locked) {
                const cur = item.roll ?? 0;
                const next = Math.max(-180, Math.min(180, cur + delta));
                return { ...item, roll: next };
              }
              return item;
            })
          );
        }
      }

      if (e.key === 'm' || e.key === 'M') {
        if (selectedItemId) {
          e.preventDefault();
          recordHistory();
          setItems((prev) =>
            prev.map((item) => {
              if (item.id === selectedItemId && !item.locked) {
                return { ...item, isMirrored: !item.isMirrored };
              }
              return item;
            })
          );
        }
      }

      // L: lock / unlock the selected piece
      if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && selectedItemId) {
        e.preventDefault();
        recordHistory();
        setItems((prev) => prev.map((item) => (item.id === selectedItemId ? { ...item, locked: !item.locked } : item)));
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItemId) {
          e.preventDefault();
          deleteItem(selectedItemId);
        }
      }

      if (e.key === 'Escape') {
        if (isDrawMode) {
          setIsDrawMode(false);
          setActiveStroke([]);
          activeStrokeRef.current = [];
        } else {
          setSelectedItemId(null);
          setPlacingEquipId(null);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    selectedItemId,
    isDrawMode,
    deleteItem,
    placingEquipId,
    handleRotateAllYaw,
    handleUndo,
    handleRedo,
    recordHistory,
    recordHistoryDebounced,
  ]);

  // Duplicate an item (unlimited stock)
  const duplicateItem = useCallback(
    (sourceItem: PlacedItem) => {
      recordHistory();
      const newItem: PlacedItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        equipId: sourceItem.equipId,
        x: Math.min(FIELD_WIDTH_M - 2, sourceItem.x + 2),
        y: Math.min(FIELD_HEIGHT_M - 2, sourceItem.y + 2),
        rotation: sourceItem.rotation,
        pitch: sourceItem.pitch,
        roll: sourceItem.roll,
        isMirrored: sourceItem.isMirrored,
        maneuver: sourceItem.maneuver,
        targetTier: sourceItem.targetTier,
        sequenceOrder: null,
      };

      setItems((prev) => {
        const next = [...prev, newItem];
        itemsRef.current = next;
        return next;
      });
      setSelectedItemId(newItem.id);
    },
    [recordHistory]
  );

  // Clear all items on the field (Reset)
  const handleClearField = useCallback(() => {
    recordHistory();
    setItems([]);
    itemsRef.current = [];
    setDrawnPath([]);
    drawnPathRef.current = [];
    setActiveStroke([]);
    activeStrokeRef.current = [];
    setSelectedItemId(null);
    setPlacingEquipId(null);
  }, [recordHistory]);

  // Load a preset track layout
  const handleLoadPreset = useCallback(
    (presetId: string) => {
      const preset = PRESET_TRACKS.find((p) => p.id === presetId);
      if (!preset) return;
      recordHistory();
      setItems(preset.items);
      itemsRef.current = preset.items;
      setCloseLoop(preset.closeLoop);
      setDroneSpeedKmH(preset.droneSpeedKmH);
      setDrawnPath(preset.drawnPath || []);
      drawnPathRef.current = preset.drawnPath || [];
      setActiveStroke([]);
      activeStrokeRef.current = [];
      setSelectedItemId(null);
      setPlacingEquipId(null);
    },
    [recordHistory]
  );

  // Load a saved track from file or local storage
  const handleLoadTrack = useCallback(
    (track: SavedTrack) => {
      recordHistory();
      setItems(track.items);
      itemsRef.current = track.items;
      setCloseLoop(track.closeLoop);
      setDroneSpeedKmH(track.droneSpeedKmH);
      setDrawnPath(track.drawnPath || []);
      drawnPathRef.current = track.drawnPath || [];
      setActiveStroke([]);
      activeStrokeRef.current = [];
      setSelectedItemId(null);
      setPlacingEquipId(null);
    },
    [recordHistory]
  );

  // Load a saved track on the field it was designed on: switch to a ground of that size
  // (creating it if this device doesn't have one), then place the track.
  const loadTrackOnItsGround = useCallback(
    (track: SavedTrack) => {
      const g = track.ground;
      const current = grounds.find((x) => x.id === activeGroundIdRef.current) ?? DEFAULT_GROUND;
      if (g && (g.width !== current.width || g.height !== current.height)) {
        const sameSize = grounds.filter((x) => x.width === g.width && x.height === g.height);
        const match = sameSize.find((x) => x.name === g.name) ?? sameSize[0];
        if (match) switchGround(match);
        else handleCreateGround(g.name, g.width, g.height);
      }
      handleLoadTrack(track);
    },
    [grounds, switchGround, handleCreateGround, handleLoadTrack]
  );

  // Android app: load a track file opened with / shared to the app (WhatsApp, Drive, Files…)
  const handleLoadTrackRef = useRef(loadTrackOnItsGround);
  handleLoadTrackRef.current = loadTrackOnItsGround;
  useEffect(
    () =>
      listenForIncomingTrackFiles(({ name, text, error }) => {
        if (error || text === undefined) {
          window.alert(error ?? `Could not read ${name}`);
          return;
        }
        let track: SavedTrack;
        try {
          track = parseTrackText(text, name);
        } catch (err: any) {
          window.alert(`${name}: ${err?.message ?? err}`);
          return;
        }
        const gates = track.items.length;
        // Give the WebView a moment to finish its first render before the dialog
        setTimeout(() => {
          if (
            window.confirm(
              `Load track "${track.name}" (${gates} item${gates === 1 ? '' : 's'}${
                track.ground ? `, ${track.ground.width} × ${track.ground.height} m field` : ''
              })?\n\nIt replaces what's on the field now. You can undo.`
            )
          ) {
            handleLoadTrackRef.current(track);
            setIsSaveModalOpen(false);
            setIsMobilePanelOpen(false);
          }
        }, 300);
      }),
    []
  );

  // Toggle Draw Track Line mode
  const handleToggleDrawMode = useCallback(() => {
    setIsDrawMode((prev) => {
      const next = !prev;
      if (next) {
        setSelectedItemId(null);
        setPlacingEquipId(null);
      } else {
        setActiveStroke([]);
        activeStrokeRef.current = [];
      }
      return next;
    });
  }, []);

  // Clear custom drawn track line
  const handleClearDrawnPath = useCallback(() => {
    if (drawnPath.length > 0) {
      recordHistory();
      setDrawnPath([]);
      drawnPathRef.current = [];
      setActiveStroke([]);
      activeStrokeRef.current = [];
      isDrawingStrokeRef.current = false;
      setIsDrawingStroke(false);
      setCloseDrawnLoop(false);
    }
  }, [drawnPath.length, recordHistory]);

  // Smooth custom drawn track line
  const handleSmoothDrawnPath = useCallback(() => {
    if (drawnPath.length >= 3) {
      recordHistory();
      const smoothed = smoothPathPoints(drawnPath, 1);
      drawnPathRef.current = smoothed;
      setDrawnPath(smoothed);
    }
  }, [drawnPath, recordHistory]);

  // Auto-generate curved flight path from gates & orbit flag poles
  const handleGenerateCurveFromGates = useCallback(() => {
    const curve = generateCurvedPathFromGates(items, closeLoop);
    if (curve.length >= 2) {
      recordHistory();
      const smoothed = smoothPathPoints(curve, 2).map((pt) => ({
        ...pt,
        color: pt.color || drawnPathColor,
      }));
      drawnPathRef.current = smoothed;
      setDrawnPath(smoothed);
    }
  }, [items, closeLoop, drawnPathColor, recordHistory]);

  // Undo last drawn stroke or action
  const handleUndoLastStroke = useCallback(() => {
    handleUndo();
  }, [handleUndo]);

  // Auto-order all gates sequentially based on clockwise layout around center
  const handleAutoSequence = useCallback(() => {
    if (items.length === 0) return;
    recordHistory();

    // Calculate angle from center of field (28.5, 21.5)
    const centerX = FIELD_WIDTH_M / 2;
    const centerY = FIELD_HEIGHT_M / 2;

    const sorted = [...items].sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX);
      const angleB = Math.atan2(b.y - centerY, b.x - centerX);
      return angleA - angleB;
    });

    const next = sorted.map((item, idx) => ({
      ...item,
      sequenceOrder: idx + 1,
    }));
    itemsRef.current = next;
    setItems(next);
  }, [items, recordHistory]);

  // Unlink/clear flight path sequence numbers from all gates
  const handleClearSequence = useCallback(() => {
    recordHistory();
    const next = items.map((item) => ({ ...item, sequenceOrder: null }));
    itemsRef.current = next;
    setItems(next);
  }, [items, recordHistory]);

  // Mouse wheel zoom handling and gate yaw rotate
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // If placing equipment, mouse wheel rotates placement yaw
    if (placingEquipId) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 15 : -15;
      setDefaultPlacementYaw((prev) => (prev + delta + 360) % 360);
      return;
    }

    // If Alt held and an item is selected or hovered, rotate its yaw
    if (e.altKey && (selectedItemId || hoveredItemId)) {
      e.preventDefault();
      const targetId = selectedItemId || hoveredItemId;
      if (targetId) {
        const delta = e.deltaY < 0 ? 15 : -15;
        setItems((prev) =>
          prev.map((it) =>
            it.id === targetId ? { ...it, rotation: (it.rotation + delta + 360) % 360 } : it
          )
        );
      }
      return;
    }

    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.min(Math.max(8, viewport.scale * zoomFactor), 60);

    const worldPos = screenToWorld(mouseX, mouseY);
    const newOffsetX = mouseX - worldPos.x * newScale;
    const newOffsetY = mouseY - worldPos.y * newScale;

    setViewport({
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    });
  };

  // Mouse down event handler (Selection, Dragging, Rotation, or Panning)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);

    // 1. Pan view if middle click, right click, or spacebar held
    if (e.button === 1 || e.button === 2 || spacePressedRef.current) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (e.button !== 0) return; // Only left click for interactions below

    // Snapshot state before any drawing, rotation, or dragging starts
    dragStartSnapshotRef.current = {
      items: JSON.parse(JSON.stringify(itemsRef.current)),
      drawnPath: JSON.parse(JSON.stringify(drawnPathRef.current)),
    };

    // If Draw Track Line mode is active, handle drawing points
    if (isDrawMode) {
      isDrawingStrokeRef.current = true;
      setIsDrawingStroke(true);

      const currentPt: TrackPoint = {
        x: Number(world.x.toFixed(2)),
        y: Number(world.y.toFixed(2)),
        color: drawnPathColor,
      };

      if (drawnPath.length > 0) {
        const lastPt = drawnPath[drawnPath.length - 1];
        // Resume directly from where line stopped!
        activeStrokeRef.current = [lastPt, currentPt];
        setActiveStroke([lastPt, currentPt]);
      } else {
        activeStrokeRef.current = [currentPt];
        setActiveStroke([currentPt]);
      }
      return;
    }

    // 2. Click-to-place active equipment from inventory
    if (placingEquipId) {
      const remaining = stockCounts.get(placingEquipId) ?? 0;
      if (remaining > 0) {
        recordHistory();
        const snappedX = snapCoord(world.x, snapGrid, FIELD_WIDTH_M);
        const snappedY = snapCoord(world.y, snapGrid, FIELD_HEIGHT_M);

        const newItem: PlacedItem = {
          id: `item-${Date.now()}`,
          equipId: placingEquipId,
          x: snappedX,
          y: snappedY,
          rotation: defaultPlacementYaw,
          sequenceOrder: null,
        };

        const next = [...items, newItem];
        itemsRef.current = next;
        setItems(next);
        setSelectedItemId(newItem.id);

        // Immediate release of placing mode so user can freely click other gates
        setPlacingEquipId(null);
      }
      return;
    }

    // 2.4 Check if clicking on the ROTATION HANDLE knob of any flight maneuver badge
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.maneuver && item.maneuver !== 'straight') {
        if (hitTestManeuverRotateHandle(world.x, world.y, item)) {
          setSelectedItemId(item.id);
          isRotatingManeuverRef.current = true;
          rotatingManeuverItemIdRef.current = item.id;
          setIsRotatingManeuver(true);
          return;
        }
      }
    }

    // 2.5 Check if clicking on any flight maneuver badge to drag it horizontally or vertically
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.maneuver && item.maneuver !== 'straight') {
        if (hitTestManeuverBadge(world.x, world.y, item)) {
          setSelectedItemId(item.id);
          isDraggingManeuverRef.current = true;
          draggingManeuverItemIdRef.current = item.id;
          setIsDraggingManeuver(true);

          const layout = getManeuverBadgeLayout(item);
          const origOffsetX = item.maneuverOffsetX ?? (layout ? layout.x - item.x : 0);
          const origOffsetY = item.maneuverOffsetY ?? (layout ? layout.y - item.y : 0);

          dragManeuverStartRef.current = {
            startX: world.x,
            startY: world.y,
            origOffsetX,
            origOffsetY,
          };
          return;
        }
      }
    }

    // 3. Check if clicking rotation handle of already-selected item or ANY gate
    if (selectedItemId) {
      const selected = items.find((i) => i.id === selectedItemId);
      if (selected && !selected.locked && hitTestRotationHandle(world.x, world.y, selected)) {
        isRotatingItemRef.current = true;
        setIsRotatingGate(true);
        return;
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.locked && hitTestRotationHandle(world.x, world.y, it)) {
        setSelectedItemId(it.id);
        isRotatingItemRef.current = true;
        setIsRotatingGate(true);
        return;
      }
    }

    // 4. Hit test all placed items (reverse order to pick top-most item)
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (hitTestItem(world.x, world.y, item)) {
        setSelectedItemId(item.id);
        if (item.locked) return; // select only: locked pieces stay put
        isDraggingItemRef.current = true;
        dragItemOffsetRef.current = {
          dx: world.x - item.x,
          dy: world.y - item.y,
        };
        return;
      }
    }

    // 5. Clicked empty space -> deselect
    setSelectedItemId(null);
  };

  // Mouse move handler
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);
    mouseWorldPosRef.current = world;
    setCursorWorldCoords({ x: world.x, y: world.y });

    // Handle Dragging Flight Maneuver badge horizontally or vertically
    if (isDraggingManeuverRef.current && draggingManeuverItemIdRef.current) {
      const targetId = draggingManeuverItemIdRef.current;
      const { startX, startY, origOffsetX, origOffsetY } = dragManeuverStartRef.current;
      const dx = world.x - startX;
      const dy = world.y - startY;

      const newOffsetX = Number((origOffsetX + dx).toFixed(2));
      const newOffsetY = Number((origOffsetY + dy).toFixed(2));

      setItems((prev) =>
        prev.map((it) =>
          it.id === targetId
            ? { ...it, maneuverOffsetX: newOffsetX, maneuverOffsetY: newOffsetY }
            : it
        )
      );
      return;
    }

    // Handle Rotating Flight Maneuver badge
    if (isRotatingManeuverRef.current && rotatingManeuverItemIdRef.current) {
      const targetId = rotatingManeuverItemIdRef.current;
      const targetItem = items.find((it) => it.id === targetId);
      if (targetItem) {
        const layout = getManeuverBadgeLayout(targetItem);
        if (layout) {
          const dx = world.x - layout.x;
          const dy = world.y - layout.y;
          // In world space, angle 0 is +X (right), -90 is -Y (top)
          // Knob sits at the top of the badge (-Y), so +90 offset aligns angle with 0°
          let rawAngle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
          if (rawAngle < 0) rawAngle += 360;

          // Snap to 15-degree increments
          const snapped = Math.round(rawAngle / 15) * 15;
          const finalAngle = snapped >= 360 ? 0 : snapped;

          setItems((prev) =>
            prev.map((it) =>
              it.id === targetId ? { ...it, maneuverRotation: finalAngle } : it
            )
          );
        }
      }
      return;
    }

    // Handle Drawing Track line
    if (isDrawMode && isDrawingStrokeRef.current) {
      const currentPts = activeStrokeRef.current;
      if (currentPts.length > 0) {
        const lastPt = currentPts[currentPts.length - 1];
        const dx = world.x - lastPt.x;
        const dy = world.y - lastPt.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Add point if moved at least 0.3 meters to prevent point clustering
        if (dist >= 0.3) {
          const nextPt: TrackPoint = {
            x: Number(world.x.toFixed(2)),
            y: Number(world.y.toFixed(2)),
            color: drawnPathColor,
          };
          const updated = [...currentPts, nextPt];
          activeStrokeRef.current = updated;
          setActiveStroke(updated);
        }
      }
      return;
    }

    // Handle Panning
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.clientX, y: e.clientY };

      setViewport((prev) => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      }));
      return;
    }

    // Handle Rotation with mouse
    if (isRotatingItemRef.current && selectedItemId) {
      const item = items.find((i) => i.id === selectedItemId);
      if (item) {
        const dx = world.x - item.x;
        const dy = world.y - item.y;
        // Direction vector from item center to cursor
        // Math.atan2(dy, dx) returns angle where 0 is right (+X).
        // Since gate top points up (-Y), forward direction has +90 deg offset
        let rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        if (rawAngleDeg < 0) rawAngleDeg += 360;

        // Shift gives fine 1-degree rotation, default snaps to 5-degree increments
        const snap = e.shiftKey ? 1 : 5;
        const snappedAngle = Math.round(rawAngleDeg / snap) * snap;
        const finalAngle = snappedAngle >= 360 ? 0 : snappedAngle;

        updateItem(selectedItemId, { rotation: finalAngle });
      }
      return;
    }

    // Handle Dragging Item
    if (isDraggingItemRef.current && selectedItemId) {
      const rawX = world.x - dragItemOffsetRef.current.dx;
      const rawY = world.y - dragItemOffsetRef.current.dy;

      const snappedX = snapCoord(rawX, snapGrid, FIELD_WIDTH_M);
      const snappedY = snapCoord(rawY, snapGrid, FIELD_HEIGHT_M);

      updateItem(selectedItemId, { x: snappedX, y: snappedY });
      return;
    }

    // Hover state testing for gate rotate handle, maneuver rotate knob, maneuver badge, and items
    let hoveredGateRotate: string | null = null;
    let hoveredRotateId: string | null = null;
    let hoveredManeuver: string | null = null;
    if (!isDrawMode && !isDraggingItemRef.current && !isRotatingItemRef.current && !isRotatingManeuverRef.current) {
      // Check gate rotate knob (selected first, then all)
      if (selectedItemId) {
        const sel = items.find((i) => i.id === selectedItemId);
        if (sel && hitTestRotationHandle(world.x, world.y, sel)) {
          hoveredGateRotate = sel.id;
        }
      }
      if (!hoveredGateRotate) {
        for (let i = items.length - 1; i >= 0; i--) {
          if (hitTestRotationHandle(world.x, world.y, items[i])) {
            hoveredGateRotate = items[i].id;
            break;
          }
        }
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.maneuver && it.maneuver !== 'straight') {
          if (hitTestManeuverRotateHandle(world.x, world.y, it)) {
            hoveredRotateId = it.id;
            break;
          }
          if (hitTestManeuverBadge(world.x, world.y, it)) {
            hoveredManeuver = it.id;
            break;
          }
        }
      }
    }
    setHoveredGateRotateHandleId(hoveredGateRotate);
    setHoveredManeuverRotateHandleId(hoveredRotateId);
    setHoveredManeuverItemId(hoveredManeuver);

    let hoveredId: string | null = null;
    if (!hoveredGateRotate && !hoveredRotateId && !hoveredManeuver) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (hitTestItem(world.x, world.y, items[i])) {
          hoveredId = items[i].id;
          break;
        }
      }
    }
    setHoveredItemId(hoveredId);
  };

  // Mouse up handler
  const handleMouseUp = () => {
    isDraggingItemRef.current = false;
    isRotatingItemRef.current = false;
    setIsRotatingGate(false);
    isPanningRef.current = false;

    if (isDraggingManeuverRef.current) {
      isDraggingManeuverRef.current = false;
      draggingManeuverItemIdRef.current = null;
      setIsDraggingManeuver(false);
    }

    if (isRotatingManeuverRef.current) {
      isRotatingManeuverRef.current = false;
      rotatingManeuverItemIdRef.current = null;
      setIsRotatingManeuver(false);
    }

    if (isDrawMode && isDrawingStrokeRef.current) {
      isDrawingStrokeRef.current = false;
      setIsDrawingStroke(false);
      const stroke = activeStrokeRef.current;
      if (stroke.length >= 2) {
        // Explicitly stamp active color on points in this stroke
        const strokeWithColor = stroke.map((pt) => ({
          ...pt,
          color: pt.color || drawnPathColor,
        }));
        // Lightly smooth the stroke while preserving color
        const smoothedStroke = smoothPathPoints(strokeWithColor, 1).map((pt) => ({
          ...pt,
          color: pt.color || drawnPathColor,
        }));

        const newPath = (() => {
          if (drawnPathRef.current.length === 0) return smoothedStroke;
          // Connect seamlessly: check if first point merges cleanly with last point of previous line
          const lastOld = drawnPathRef.current[drawnPathRef.current.length - 1];
          const firstNew = smoothedStroke[0];
          if (Math.hypot(firstNew.x - lastOld.x, firstNew.y - lastOld.y) < 0.5) {
            return [...drawnPathRef.current, ...smoothedStroke.slice(1)];
          }
          return [...drawnPathRef.current, ...smoothedStroke];
        })();

        drawnPathRef.current = newPath;
        setDrawnPath(newPath);
      }
      activeStrokeRef.current = [];
      setActiveStroke([]);
    }

    // Check if drag/rotation/draw stroke modified state; if so, push to undo stack
    if (dragStartSnapshotRef.current) {
      const prevItemsJson = JSON.stringify(dragStartSnapshotRef.current.items);
      const curItemsJson = JSON.stringify(itemsRef.current);
      const prevPathJson = JSON.stringify(dragStartSnapshotRef.current.drawnPath);
      const curPathJson = JSON.stringify(drawnPathRef.current);

      if (prevItemsJson !== curItemsJson || prevPathJson !== curPathJson) {
        const snapshotToPush = dragStartSnapshotRef.current;
        setUndoStack((prev) => [...prev.slice(-40), snapshotToPush]);
        setRedoStack([]);
      }
      dragStartSnapshotRef.current = null;
    }
  };

  // Touch event handlers for mobile/touch screens
  // Two-finger pinch: zoom around the fingers' midpoint and pan as they move
  const pinchRef = useRef<{ startDist: number; startScale: number; worldMid: { x: number; y: number } } | null>(null);

  const touchPair = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length < 2) return null;
    const rect = canvas.getBoundingClientRect();
    const [a, b] = [e.touches[0], e.touches[1]];
    return {
      dist: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
      midX: (a.clientX + b.clientX) / 2 - rect.left,
      midY: (a.clientY + b.clientY) / 2 - rect.top,
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length >= 2) {
      const pair = touchPair(e);
      if (!pair) return;
      // A second finger means "navigate", so drop any stroke or drag the first finger began
      isDrawingStrokeRef.current = false;
      setIsDrawingStroke(false);
      activeStrokeRef.current = [];
      setActiveStroke([]);
      isRotatingManeuverRef.current = false;
      setIsRotatingManeuver(false);
      isDraggingManeuverRef.current = false;
      setIsDraggingManeuver(false);
      pinchRef.current = {
        startDist: pair.dist,
        startScale: viewport.scale,
        worldMid: screenToWorld(pair.midX, pair.midY),
      };
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const screenX = touch.clientX - rect.left;
      const screenY = touch.clientY - rect.top;
      const world = screenToWorld(screenX, screenY);

      dragStartSnapshotRef.current = {
        items: JSON.parse(JSON.stringify(itemsRef.current)),
        drawnPath: JSON.parse(JSON.stringify(drawnPathRef.current)),
      };

      if (isDrawMode) {
        isDrawingStrokeRef.current = true;
        setIsDrawingStroke(true);
        const currentPt: TrackPoint = {
          x: Number(world.x.toFixed(2)),
          y: Number(world.y.toFixed(2)),
          color: drawnPathColor,
        };

        if (drawnPath.length > 0) {
          const lastPt = drawnPath[drawnPath.length - 1];
          activeStrokeRef.current = [lastPt, currentPt];
          setActiveStroke([lastPt, currentPt]);
        } else {
          activeStrokeRef.current = [currentPt];
          setActiveStroke([currentPt]);
        }
        return;
      }

      // Check if touching a flight maneuver rotate knob
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item.maneuver && item.maneuver !== 'straight' && hitTestManeuverRotateHandle(world.x, world.y, item)) {
          setSelectedItemId(item.id);
          isRotatingManeuverRef.current = true;
          rotatingManeuverItemIdRef.current = item.id;
          setIsRotatingManeuver(true);
          return;
        }
      }

      // Check if touching a flight maneuver badge to drag it
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item.maneuver && item.maneuver !== 'straight' && hitTestManeuverBadge(world.x, world.y, item)) {
          setSelectedItemId(item.id);
          isDraggingManeuverRef.current = true;
          draggingManeuverItemIdRef.current = item.id;
          setIsDraggingManeuver(true);

          const layout = getManeuverBadgeLayout(item);
          const origOffsetX = item.maneuverOffsetX ?? (layout ? layout.x - item.x : 0);
          const origOffsetY = item.maneuverOffsetY ?? (layout ? layout.y - item.y : 0);

          dragManeuverStartRef.current = {
            startX: world.x,
            startY: world.y,
            origOffsetX,
            origOffsetY,
          };
          return;
        }
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length >= 2 && pinchRef.current) {
      const pair = touchPair(e);
      if (!pair) return;
      const { startDist, startScale, worldMid } = pinchRef.current;
      const newScale = Math.min(Math.max(8, startScale * (pair.dist / startDist)), 60);
      setViewport({
        scale: newScale,
        offsetX: pair.midX - worldMid.x * newScale,
        offsetY: pair.midY - worldMid.y * newScale,
      });
      return;
    }
    if (pinchRef.current) return; // one finger left over after a pinch: ignore until all lift
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const screenX = touch.clientX - rect.left;
      const screenY = touch.clientY - rect.top;
      const world = screenToWorld(screenX, screenY);

      if (isRotatingManeuverRef.current && rotatingManeuverItemIdRef.current) {
        const targetId = rotatingManeuverItemIdRef.current;
        const targetItem = items.find((it) => it.id === targetId);
        if (targetItem) {
          const layout = getManeuverBadgeLayout(targetItem);
          if (layout) {
            const dx = world.x - layout.x;
            const dy = world.y - layout.y;
            let rawAngle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
            if (rawAngle < 0) rawAngle += 360;
            const snapped = Math.round(rawAngle / 15) * 15;
            const finalAngle = snapped >= 360 ? 0 : snapped;
            setItems((prev) =>
              prev.map((it) =>
                it.id === targetId ? { ...it, maneuverRotation: finalAngle } : it
              )
            );
          }
        }
        return;
      }

      if (isDraggingManeuverRef.current && draggingManeuverItemIdRef.current) {
        const targetId = draggingManeuverItemIdRef.current;
        const { startX, startY, origOffsetX, origOffsetY } = dragManeuverStartRef.current;
        const dx = world.x - startX;
        const dy = world.y - startY;

        const newOffsetX = Number((origOffsetX + dx).toFixed(2));
        const newOffsetY = Number((origOffsetY + dy).toFixed(2));

        setItems((prev) =>
          prev.map((it) =>
            it.id === targetId
              ? { ...it, maneuverOffsetX: newOffsetX, maneuverOffsetY: newOffsetY }
              : it
          )
        );
        return;
      }

      if (isDrawMode && isDrawingStrokeRef.current) {
        const currentPts = activeStrokeRef.current;
        if (currentPts.length > 0) {
          const lastPt = currentPts[currentPts.length - 1];
          const dx = world.x - lastPt.x;
          const dy = world.y - lastPt.y;
          if (Math.sqrt(dx * dx + dy * dy) >= 0.25) {
            const nextPt: TrackPoint = {
              x: Number(world.x.toFixed(2)),
              y: Number(world.y.toFixed(2)),
              color: drawnPathColor,
            };
            const updated = [...currentPts, nextPt];
            activeStrokeRef.current = updated;
            setActiveStroke(updated);
          }
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (pinchRef.current) {
      if (e.touches.length === 0) pinchRef.current = null;
      return;
    }
    if (isDraggingManeuverRef.current) {
      isDraggingManeuverRef.current = false;
      draggingManeuverItemIdRef.current = null;
      setIsDraggingManeuver(false);
    }
    handleMouseUp();
  };

  // Drag over handler for HTML5 drag-and-drop from sidebar
  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  // Drop handler from sidebar inventory
  // Place a piece of equipment at a field position (used by the 3D view: click or drag-and-drop)
  const placeEquipmentAt = useCallback(
    (equipId: string, x: number, y: number) => {
      if (!EQUIPMENT_MAP.has(equipId)) return;
      if ((stockCounts.get(equipId) ?? 0) <= 0) return;
      recordHistory();
      const newItem: PlacedItem = {
        id: `item-${Date.now()}`,
        equipId,
        x: snapCoord(x, snapGrid, FIELD_WIDTH_M),
        y: snapCoord(y, snapGrid, FIELD_HEIGHT_M),
        rotation: defaultPlacementYaw,
        sequenceOrder: null,
      };
      const next = [...itemsRef.current, newItem];
      itemsRef.current = next;
      setItems(next);
      setSelectedItemId(newItem.id);
      setPlacingEquipId(null);
    },
    [stockCounts, recordHistory, snapGrid, defaultPlacementYaw]
  );

  // ---- 3D export (model / image) ----
  const [export3DRequest, setExport3DRequest] = useState<Export3DRequest | null>(null);
  const [export3DStatus, setExport3DStatus] = useState<{ state: 'working' | 'done' | 'error'; message: string } | null>(
    null
  );
  const handleExport3D = useCallback(
    (kind: Export3DKind, trackName: string) => {
      const slug = (t: string) => t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const fileBase = [slug(activeGround.name) || 'ground', slug(trackName) || 'track', '3d'].join('-');
      const lengthM = metrics.totalDistance.toFixed(1);
      const caption = [
        `${activeGround.name.toUpperCase()} · ${trackName.trim() || 'Track'}`,
        `${activeGround.width}m × ${activeGround.height}m field · ${items.length} pieces · ${lengthM} m lap · ` +
          `${metrics.estimatedLapTime.toFixed(1)} s at ${droneSpeedKmH} km/h · ${new Date().toLocaleDateString()}`,
      ];
      setSelectedItemId(null); // keep the selection highlight out of the export
      if (viewMode !== '3d') switchViewMode('3d');
      setExport3DStatus({ state: 'working', message: kind === 'glb' ? 'Building 3D model…' : 'Capturing 3D view…' });
      setExport3DRequest({ kind, fileBase, caption, nonce: Date.now() });
    },
    // switchViewMode is a plain function; viewMode guards the call
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGround, metrics, items.length, droneSpeedKmH, viewMode]
  );
  const handleExport3DDone = useCallback((ok: boolean, message: string) => {
    setExport3DRequest(null);
    setExport3DStatus({ state: ok ? 'done' : 'error', message });
  }, []);

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const equipId = e.dataTransfer.getData('text/plain');
    if (!equipId || !EQUIPMENT_MAP.has(equipId)) return;

    const remaining = stockCounts.get(equipId) ?? 0;
    if (remaining <= 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);

    const snappedX = snapCoord(world.x, snapGrid, FIELD_WIDTH_M);
    const snappedY = snapCoord(world.y, snapGrid, FIELD_HEIGHT_M);

    recordHistory();
    const newItem: PlacedItem = {
      id: `item-${Date.now()}`,
      equipId,
      x: snappedX,
      y: snappedY,
      rotation: defaultPlacementYaw,
      sequenceOrder: null,
    };

    const next = [...items, newItem];
    itemsRef.current = next;
    setItems(next);
    setSelectedItemId(newItem.id);
    setPlacingEquipId(null);
  };

  return (
    <div id="app-shell" className="relative flex w-screen overflow-hidden bg-tg-panel text-slate-100 select-none">
      {/* Phone layout: dim the field behind the open inventory drawer */}
      {isMobilePanelOpen && (
        <div
          className="hidden compact:block fixed inset-0 z-40 bg-black/60"
          onClick={() => setIsMobilePanelOpen(false)}
        />
      )}
      {/* Left Sidebar Inventory Panel */}
      <Sidebar
        onCreateEquipment={handleCreateEquipment}
        onDeleteEquipment={handleDeleteEquipment}
        grounds={grounds}
        activeGround={activeGround}
        onSwitchGround={switchGround}
        onCreateGround={handleCreateGround}
        onDeleteGround={handleDeleteGround}
        items={items}
        placingEquipId={placingEquipId}
        onSelectPlacingEquip={(id) => {
          setPlacingEquipId(id);
          // On phones, get the drawer out of the way so the user can tap the field to place it
          if (id) setIsMobilePanelOpen(false);
        }}
        onClearField={handleClearField}
        onLoadPreset={(presetId) => {
          handleLoadPreset(presetId);
          setIsMobilePanelOpen(false);
        }}
        onOpenSaveModal={() => {
          setIsSaveModalOpen(true);
          setIsMobilePanelOpen(false);
        }}
        onAutoSequence={handleAutoSequence}
        onClearSequence={handleClearSequence}
        selectedItemId={selectedItemId}
        onDeleteItem={deleteItem}
        isDrawMode={isDrawMode}
        onToggleDrawMode={handleToggleDrawMode}
        hasDrawnPath={drawnPath.length > 0}
        onClearDrawnPath={handleClearDrawnPath}
        onSmoothDrawnPath={handleSmoothDrawnPath}
        onGenerateCurveFromGates={handleGenerateCurveFromGates}
        onRotateAllYaw={handleRotateAllYaw}
        onSetAllYaw={handleSetAllYaw}
        defaultPlacementYaw={defaultPlacementYaw}
        onChangeDefaultPlacementYaw={setDefaultPlacementYaw}
        mobileOpen={isMobilePanelOpen}
        onCloseMobile={() => setIsMobilePanelOpen(false)}
        themeName={PALETTES.find((p) => p.id === themeId)?.name ?? 'Classic Night'}
        onOpenThemePicker={() => {
          setIsThemePickerOpen(true);
          setIsMobilePanelOpen(false);
        }}
      />

      {/* Main Field Designer Canvas Viewport */}
      <main
        ref={containerRef}
        className="relative flex-1 min-w-0 h-full overflow-hidden bg-tg-deep"
        onScroll={(e) => {
          // overflow-hidden still allows focus-driven scrolling; never let the field slide sideways
          if (e.currentTarget.scrollLeft || e.currentTarget.scrollTop) {
            e.currentTarget.scrollLeft = 0;
            e.currentTarget.scrollTop = 0;
          }
        }}
      >
        {/* Phone layout: open the inventory drawer */}
        <button
          type="button"
          onClick={() => setIsMobilePanelOpen(true)}
          className="hidden compact:flex absolute top-2 left-2 z-30 w-10 h-10 items-center justify-center rounded-xl bg-tg-panel/95 border border-slate-700 text-sky-300 shadow-xl active:bg-slate-800"
          aria-label="Open equipment panel"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Top & Bottom Telemetry HUD */}
        <TrackHUD
          metrics={metrics}
          closeLoop={closeLoop}
          onToggleCloseLoop={() => setCloseLoop((prev) => !prev)}
          closeDrawnLoop={closeDrawnLoop}
          onToggleCloseDrawnLoop={() => setCloseDrawnLoop((prev) => !prev)}
          snapGrid={snapGrid}
          onChangeSnapGrid={setSnapGrid}
          droneSpeedKmH={droneSpeedKmH}
          onChangeDroneSpeed={setDroneSpeedKmH}
          itemCount={items.length}
          onRotateAllYaw={handleRotateAllYaw}
          onSetAllYaw={handleSetAllYaw}
          onZoomIn={() =>
            setViewport((prev) => ({
              ...prev,
              scale: Math.min(60, prev.scale * 1.2),
            }))
          }
          onZoomOut={() =>
            setViewport((prev) => ({
              ...prev,
              scale: Math.max(8, prev.scale * 0.8),
            }))
          }
          onFitField={fitFieldToScreen}
          onResetView={fitFieldToScreen}
          isDrawMode={isDrawMode}
          onToggleDrawMode={handleToggleDrawMode}
          hasDrawnPath={drawnPath.length > 0}
          onClearDrawnPath={handleClearDrawnPath}
          onSmoothDrawnPath={handleSmoothDrawnPath}
          onGenerateCurveFromGates={handleGenerateCurveFromGates}
          onUndoLastStroke={handleUndoLastStroke}
          canUndoStroke={undoStack.length > 0}
          onUndo={handleUndo}
          canUndo={undoStack.length > 0}
          onRedo={handleRedo}
          canRedo={redoStack.length > 0}
          showDistances={showDistances}
          onToggleShowDistances={() => setShowDistances((prev) => !prev)}
          drawnPathColor={drawnPathColor}
          onChangeDrawnPathColor={setDrawnPathColor}
        />

        {/* Draw Mode Notification Banner */}
        {isDrawMode && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 compact:hidden bg-emerald-950/95 border border-emerald-400 text-emerald-200 px-4 py-1.5 rounded-full shadow-2xl font-mono text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span><strong>DRAW MODE:</strong> Click & drag freely to trace race lines & orbit flag poles</span>
            <span className="text-emerald-400/60 text-[10px] ml-1">(D to finish / Esc to exit)</span>
          </div>
        )}

        {/* Placing Mode Notification Banner */}
        {placingEquipId && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-slate-900/95 border border-sky-400 text-sky-200 px-4 py-2 rounded-xl shadow-2xl font-mono text-xs flex items-center gap-3 compact:top-auto compact:bottom-14 compact:left-2 compact:right-2 compact:translate-x-0 compact:flex-wrap compact:justify-center compact:gap-2 compact:px-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
              <span>Placing <strong>{EQUIPMENT_MAP.get(placingEquipId)?.name}</strong></span>
            </div>

            {/* Quick Gate Yaw Placement Controls */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-700">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-300 font-bold">Yaw: {Math.round(defaultPlacementYaw)}°</span>
              <button
                onClick={() => setDefaultPlacementYaw((prev) => (prev - 15 + 360) % 360)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] transition"
                title="Rotate yaw -15° (Shift+R / Scroll)"
              >
                ↺ -15°
              </button>
              <button
                onClick={() => setDefaultPlacementYaw((prev) => (prev + 15) % 360)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] transition"
                title="Rotate yaw +15° (R / Scroll)"
              >
                +15° ↻
              </button>
              <button
                onClick={() => setDefaultPlacementYaw((prev) => (prev + 90) % 360)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] transition"
                title="Rotate +90°"
              >
                90°
              </button>
            </div>

            <button
              onClick={() => setPlacingEquipId(null)}
              className="text-slate-400 hover:text-white font-bold ml-1"
              title="Cancel placement (Esc)"
            >
              ✕
            </button>
          </div>
        )}

        {/* Live Coordinate Cursor Readout Pill */}
        {cursorWorldCoords && (
          <div className="absolute bottom-3 right-4 z-10 pointer-events-none compact:hidden bg-tg-panel/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 shadow-lg font-mono text-[11px] text-slate-400">
            <span className="text-slate-400">CURSOR: </span>
            <span className="text-cyan-400 font-bold">X {cursorWorldCoords.x.toFixed(1)}m</span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-cyan-400 font-bold">Y {cursorWorldCoords.y.toFixed(1)}m</span>
            {!isInsideFence(cursorWorldCoords.x, cursorWorldCoords.y) && (
              <span className="text-amber-400 ml-1.5">(Fence Zone)</span>
            )}
          </div>
        )}

        {/* Selected Item Floating Inspector */}
        <ItemInspector
          item={selectedItem}
          onUpdateItem={updateItem}
          onDeleteItem={deleteItem}
          onDuplicateItem={duplicateItem}
          onClose={() => setSelectedItemId(null)}
          maxSequence={maxSequence}
          canDuplicate={canDuplicateSelected}
        />

        {/* HTML5 Canvas Surface */}
        <canvas
          id="field-canvas"
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={handleWheel}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`w-full h-full block touch-none ${
            isDrawMode
              ? 'cursor-crosshair'
              : isRotatingManeuver || hoveredManeuverRotateHandleId || isRotatingGate || hoveredGateRotateHandleId
              ? 'cursor-alias'
              : isDraggingManeuver
              ? 'cursor-grabbing'
              : hoveredManeuverItemId
              ? 'cursor-grab'
              : 'cursor-default'
          }`}
        />

        {/* 3D field view (overlays the 2D map; HUD and inspector stay on top) */}
        {viewMode === '3d' && (
          <div className="absolute inset-0 z-[5] bg-tg-deep">
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center bg-tg-deep text-slate-400 font-mono text-xs">
                  Loading 3D view…
                </div>
              }
            >
              <Field3D
                key={activeGroundId}
                groundName={activeGround.name}
                themeId={themeId}
                items={items}
                drawnPath={drawnPath}
                closeLoop={closeLoop}
                closeDrawnLoop={closeDrawnLoop}
                droneSpeedKmH={droneSpeedKmH}
                drawnPathColor={drawnPathColor}
                selectedItemId={selectedItemId}
                onSelectItem={setSelectedItemId}
                onMoveItemStart={handle3DMoveStart}
                onMoveItem={handle3DMove}
                onMoveItemEnd={handle3DMoveEnd}
                onPathEditStart={handlePathEditStart}
                onPathChange={handlePathChange}
                onPathEditEnd={handlePathEditEnd}
                placingEquipId={placingEquipId}
                placementYaw={defaultPlacementYaw}
                snapGrid={snapGrid}
                onPlaceAt={placeEquipmentAt}
                exportRequest={export3DRequest}
                onExportDone={handleExport3DDone}
              />
            </Suspense>
          </div>
        )}

        {/* 2D / 3D view switch */}
        <div className="absolute bottom-16 left-4 z-20 flex items-center bg-tg-panel/95 border border-slate-700 rounded-xl p-1 shadow-2xl font-mono text-[11px] compact:bottom-2 compact:left-2">
          {(['2d', '3d'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => switchViewMode(mode)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition ${
                viewMode === mode
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
              title={mode === '2d' ? 'Top-down map editor' : '3D field view'}
            >
              {mode === '2d' ? <MapIcon className="w-3.5 h-3.5" /> : <Box className="w-3.5 h-3.5" />}
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </main>

      {/* Colour theme picker */}
      <ThemePicker
        isOpen={isThemePickerOpen}
        activeId={themeId}
        onSelect={handleSelectTheme}
        onClose={() => setIsThemePickerOpen(false)}
      />

      {/* Save, Export & Load Track Dialog */}
      <SaveLoadModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        items={items}
        closeLoop={closeLoop}
        droneSpeedKmH={droneSpeedKmH}
        drawnPath={drawnPath}
        ground={activeGround}
        onLoadTrack={loadTrackOnItsGround}
        onExport3D={handleExport3D}
        export3DStatus={export3DStatus}
      />
    </div>
  );
}
