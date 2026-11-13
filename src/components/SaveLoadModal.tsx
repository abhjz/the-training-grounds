import React from 'react';
import {
  Download,
  Upload,
  Save,
  Trash2,
  FileImage,
  Box,
  Camera,
  Loader2,
  FileCode,
  FolderOpen,
  X,
  Check,
} from 'lucide-react';
import { PlacedItem, SavedTrack, TrackGround, TrackPoint } from '../types';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M } from '../constants/equipment';
import {
  deleteTrackFromLocalStorage,
  exportTrackToJSON,
  exportTrackToPNG,
  getStoredTracks,
  parseUploadedTrackJSON,
  saveTrackToLocalStorage,
} from '../utils/trackExporter';
import { isNativeApp } from '../utils/fileSaver';

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PlacedItem[];
  closeLoop: boolean;
  droneSpeedKmH: number;
  drawnPath?: TrackPoint[];
  /** The field the current layout is on; saved with the track */
  ground: TrackGround;
  onLoadTrack: (track: SavedTrack) => void;
  onExport3D: (kind: 'glb' | 'png', trackName: string) => void;
  export3DStatus: { state: 'working' | 'done' | 'error'; message: string } | null;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
  isOpen,
  onClose,
  items,
  closeLoop,
  droneSpeedKmH,
  drawnPath,
  ground,
  onLoadTrack,
  onExport3D,
  export3DStatus,
}) => {
  const [trackName, setTrackName] = React.useState('My FPV Circuit');
  const [storedTracks, setStoredTracks] = React.useState<SavedTrack[]>([]);
  const [savedSuccessMessage, setSavedSuccessMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setStoredTracks(getStoredTracks());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveToBrowser = () => {
    const name = trackName.trim();
    if (!name) return;
    const existing = storedTracks.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing && !window.confirm(`A track called "${existing.name}" is already saved. Replace it?`)) return;
    const newTrack: SavedTrack = {
      id: existing?.id ?? `track-${Date.now()}`,
      name,
      date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      items,
      closeLoop,
      droneSpeedKmH,
      drawnPath: drawnPath && drawnPath.length > 0 ? drawnPath : undefined,
      ground: { name: ground.name, width: ground.width, height: ground.height },
    };
    saveTrackToLocalStorage(newTrack);
    setStoredTracks(getStoredTracks());
    setSavedSuccessMessage(`Saved "${name}" on ${ground.width} × ${ground.height} m`);
    setTimeout(() => setSavedSuccessMessage(null), 3000);
  };

  const handleDeleteSlot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTrackFromLocalStorage(id);
    setStoredTracks(getStoredTracks());
  };

  const handleExportPNG = async () => {
    try {
      await exportTrackToPNG(trackName, items, closeLoop, droneSpeedKmH, drawnPath);
    } catch (err: any) {
      alert(`Could not export image: ${err?.message ?? err}`);
    }
  };

  const handleExportJSON = async () => {
    try {
      await exportTrackToJSON(trackName, items, closeLoop, droneSpeedKmH, drawnPath, {
        name: ground.name,
        width: ground.width,
        height: ground.height,
      });
    } catch (err: any) {
      alert(`Could not export track file: ${err?.message ?? err}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const loaded = await parseUploadedTrackJSON(file);
      onLoadTrack(loaded);
      onClose();
    } catch (err: any) {
      alert(`Failed to load track file: ${err.message}`);
    } finally {
      // let the same file be picked again
      e.target.value = '';
    }
  };

  return (
    <div
      id="save-load-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl bg-tg-panel border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-mono text-slate-200 max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-sky-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Save & Export Track Layout
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {/* Track Name Input */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 uppercase tracking-wider">
              Track Name
            </label>
            <div className="flex gap-2">
              <input
                id="input-track-name"
                type="text"
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                placeholder="e.g. MultiGP 2026 Qualifier"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sky-300 text-sm focus:outline-none focus:border-sky-500 font-mono"
              />
              <button
                id="btn-save-slot"
                onClick={handleSaveToBrowser}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 transition"
              >
                <Save className="w-4 h-4" />
                Save Track
              </button>
            </div>
            {savedSuccessMessage && (
              <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1 font-semibold">
                <Check className="w-3.5 h-3.5" />
                {savedSuccessMessage}
              </p>
            )}
          </div>

          {/* Quick Export Cards */}
          <div>
            <label className="text-xs text-slate-400 block mb-2 uppercase tracking-wider">
              Export Options
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                id="btn-export-png"
                onClick={handleExportPNG}
                className="p-3.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/50 text-left transition group"
              >
                <div className="flex items-center gap-2 text-sky-400 mb-1">
                  <FileImage className="w-4 h-4" />
                  <span className="font-bold text-xs">High-Res PNG</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Export {FIELD_WIDTH_M}m × {FIELD_HEIGHT_M}m field map with grid, gates, flight path, and telemetry HUD.
                </p>
              </button>

              <button
                id="btn-export-json"
                onClick={handleExportJSON}
                className="p-3.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/50 text-left transition group"
              >
                <div className="flex items-center gap-2 text-cyan-400 mb-1">
                  <FileCode className="w-4 h-4" />
                  <span className="font-bold text-xs">Track JSON File</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Download raw track data file to share with other pilots or backup.
                </p>
              </button>

              <button
                id="btn-export-glb"
                onClick={() => onExport3D('glb', trackName)}
                disabled={export3DStatus?.state === 'working'}
                className="p-3.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-violet-500/50 text-left transition group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-violet-300 mb-1">
                  <Box className="w-4 h-4" />
                  <span className="font-bold text-xs">3D Model (.glb)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Field, gates at real height and the race line as a 3D file. Opens in Blender, 3D viewers and
                  online glTF viewers.
                </p>
              </button>

              <button
                id="btn-export-3d-png"
                onClick={() => onExport3D('png', trackName)}
                disabled={export3DStatus?.state === 'working'}
                className="p-3.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 text-left transition group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-emerald-300 mb-1">
                  <Camera className="w-4 h-4" />
                  <span className="font-bold text-xs">3D Picture (.png)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  High-res image of the 3D view from the current camera angle, with track details.
                </p>
              </button>
            </div>
            {export3DStatus && (
              <p
                className={`mt-2 flex items-center gap-1.5 text-[11px] ${
                  export3DStatus.state === 'error'
                    ? 'text-rose-300'
                    : export3DStatus.state === 'done'
                    ? 'text-emerald-300'
                    : 'text-slate-400'
                }`}
              >
                {export3DStatus.state === 'working' && <Loader2 className="w-3 h-3 animate-spin" />}
                {export3DStatus.state === 'done' && <Check className="w-3 h-3" />}
                {export3DStatus.message}
              </p>
            )}
          </div>

          {/* Import JSON File */}
          <div>
            <label className="text-xs text-slate-400 block mb-2 uppercase tracking-wider">
              Import Track File
            </label>
            <input
              type="file"
              ref={fileInputRef}
              // Android's file picker filters by MIME type and shared .json files often arrive as
              // octet-stream or text, so the app accepts any file there and checks the contents instead
              accept={isNativeApp() ? undefined : '.json,application/json'}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              id="btn-trigger-upload-json"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-700 hover:border-sky-400 bg-slate-900/50 hover:bg-slate-850 text-slate-300 text-xs flex items-center justify-center gap-2 transition"
            >
              <Upload className="w-4 h-4 text-sky-400" />
              Upload & Load Track JSON File (.json)
            </button>
          </div>

          {/* Local Storage Saved Tracks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400 uppercase tracking-wider">
                Saved Tracks ({storedTracks.length})
              </label>
            </div>

            {storedTracks.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center text-xs text-slate-500">
                No tracks saved yet. Click "Save Track" above to store your layout!
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                {storedTracks.map((saved) => (
                  <div
                    key={saved.id}
                    onClick={() => {
                      onLoadTrack(saved);
                      onClose();
                    }}
                    className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 cursor-pointer flex items-center justify-between transition group"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-200 group-hover:text-sky-300">
                        {saved.name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {saved.items.length} gates
                        {saved.ground && (
                          <span className="text-amber-300/80"> · {saved.ground.width} × {saved.ground.height} m</span>
                        )}
                        {' '}· {saved.date}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-sky-400 font-semibold group-hover:underline">
                        Load
                      </span>
                      <button
                        onClick={(e) => handleDeleteSlot(saved.id, e)}
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-slate-700 transition"
                        title="Delete saved track"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
