import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

/**
 * Frame-by-frame MP4 export for the 3D fly-through.
 *
 * The scene is stepped forward exactly one frame at a time and each frame is encoded with an exact
 * timestamp (WebCodecs + mp4-muxer). The video is perfectly smooth however slow the device is;
 * a slow device just takes longer to export.
 */

export const canExportVideo = () =>
  typeof window !== 'undefined' && typeof (window as any).VideoEncoder !== 'undefined' && typeof (window as any).VideoFrame !== 'undefined';

/** Longest side of the exported video. Full HD keeps files shareable and encoding fast. */
const MAX_SIDE = 1920;

/** Output size: the on-screen picture shape, scaled to fit Full HD, with even sides (H.264 needs that). */
export function exportSize(srcW: number, srcH: number) {
  const k = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(srcW), height: even(srcH) };
}

async function pickCodec(width: number, height: number, fps: number, bitrate: number) {
  // High profile first (best quality per bit), then Main and Baseline for older devices
  for (const codec of ['avc1.640033', 'avc1.640028', 'avc1.4d0033', 'avc1.4d0028', 'avc1.42e033', 'avc1.42e028']) {
    const config: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (supported) return config;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

export interface FrameEncoder {
  /** Copy the WebGL canvas into the video. Call straight after the frame is drawn. */
  addFrame(source: HTMLCanvasElement): Promise<void>;
  finish(): Promise<Blob>;
  abort(): void;
}

export async function createFrameEncoder(srcW: number, srcH: number, fps: number): Promise<FrameEncoder> {
  const { width, height } = exportSize(srcW, srcH);
  // About 12 Mbps at 1080p60: plenty for fast motion over detailed scenery
  const bitrate = Math.round(width * height * fps * 0.1);
  const config = await pickCodec(width, height, fps, bitrate);
  if (!config) throw new Error('This device cannot encode H.264 video.');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(config);

  // Scale the canvas into the output size (the WebGL buffer is only valid right after drawing)
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d', { alpha: false })!;
  const frameUs = 1_000_000 / fps;
  let index = 0;

  return {
    async addFrame(source) {
      if (failure) throw failure;
      ctx.drawImage(source, 0, 0, width, height);
      const frame = new VideoFrame(out, { timestamp: Math.round(index * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: index % (fps * 2) === 0 });
      frame.close();
      index++;
      // Don't run ahead of the encoder, or memory fills up on long laps
      while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
    },
    async finish() {
      await encoder.flush();
      if (failure) throw failure;
      encoder.close();
      muxer.finalize();
      return new Blob([target.buffer], { type: 'video/mp4' });
    },
    abort() {
      try {
        if (encoder.state !== 'closed') encoder.close();
      } catch {
        /* already closed */
      }
    },
  };
}
