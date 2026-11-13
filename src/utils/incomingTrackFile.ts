import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface IncomingTrackFile {
  name: string;
  text?: string;
  error?: string;
}

interface TrackFilePlugin {
  addListener(event: 'trackFile', cb: (file: IncomingTrackFile) => void): Promise<PluginListenerHandle>;
}

// Native side: android/app/src/main/java/com/trainingGrounds/fpvtrack/TrackFilePlugin.java
const TrackFile = registerPlugin<TrackFilePlugin>('TrackFile');

/**
 * Android app only: call `onFile` whenever a track file is opened with, or shared to, the app
 * (including the file that launched it). Returns an unsubscribe function.
 */
export function listenForIncomingTrackFiles(onFile: (file: IncomingTrackFile) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  TrackFile.addListener('trackFile', onFile).then((h) => {
    if (cancelled) h.remove();
    else handle = h;
  });
  return () => {
    cancelled = true;
    handle?.remove();
  };
}
