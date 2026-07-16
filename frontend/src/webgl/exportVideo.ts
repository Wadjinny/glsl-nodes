import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { Renderer } from './renderer';

export interface ExportOptions {
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  bitrate?: number;
  onProgress?: (p: number) => void;
}

export interface ExportResult {
  blob: Blob;
  ext: 'mp4' | 'webm';
}

/**
 * Export the current shader as a video, entirely in the browser.
 *
 * Preferred path: WebCodecs VideoEncoder (H.264) + mp4-muxer. Frames are
 * rendered deterministically (time = frame / fps) so the output has an exact
 * duration and locked framerate, independent of realtime performance.
 *
 * Fallback (no WebCodecs): MediaRecorder capturing the live canvas in realtime,
 * producing WebM (or MP4 where the browser supports it).
 */
export async function exportVideo(
  renderer: Renderer,
  opts: ExportOptions,
): Promise<ExportResult> {
  // H.264 requires even dimensions.
  const width = Math.max(2, Math.floor(opts.width / 2) * 2);
  const height = Math.max(2, Math.floor(opts.height / 2) * 2);
  const fps = Math.max(1, Math.round(opts.fps));
  const total = Math.max(1, Math.round(opts.durationSec * fps));
  const bitrate = opts.bitrate ?? 8_000_000;

  const hasWebCodecs =
    typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder ===
    'function';

  if (hasWebCodecs) {
    return exportWithWebCodecs(renderer, {
      width,
      height,
      fps,
      total,
      bitrate,
      onProgress: opts.onProgress,
    });
  }
  return exportWithMediaRecorder(renderer, {
    durationSec: opts.durationSec,
    fps,
    onProgress: opts.onProgress,
  });
}

interface WebCodecsOpts {
  width: number;
  height: number;
  fps: number;
  total: number;
  bitrate: number;
  onProgress?: (p: number) => void;
}

async function pickCodec(o: WebCodecsOpts): Promise<string | null> {
  // High -> baseline; first supported wins. Levels cover up to 1080p.
  const candidates = [
    'avc1.640034',
    'avc1.640028',
    'avc1.4d0028',
    'avc1.42E01E',
    'avc1.42001f',
  ];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: o.width,
        height: o.height,
        bitrate: o.bitrate,
        framerate: o.fps,
      });
      if (support.supported) return codec;
    } catch {
      // try next
    }
  }
  return null;
}

async function exportWithWebCodecs(
  renderer: Renderer,
  o: WebCodecsOpts,
): Promise<ExportResult> {
  const codec = await pickCodec(o);
  if (!codec) {
    throw new Error(
      `No supported H.264 encoder for ${o.width}x${o.height}. Try a smaller resolution.`,
    );
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: o.width, height: o.height },
    fastStart: 'in-memory',
  });

  let encodeError: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  encoder.configure({
    codec,
    width: o.width,
    height: o.height,
    bitrate: o.bitrate,
    framerate: o.fps,
  });

  renderer.beginExport();
  try {
    const frameDur = Math.round(1e6 / o.fps);
    for (let i = 0; i < o.total; i++) {
      if (encodeError) throw encodeError;
      renderer.renderFrame(i / o.fps, o.width, o.height);
      const frame = new VideoFrame(renderer.getCanvas(), {
        timestamp: Math.round((i * 1e6) / o.fps),
        duration: frameDur,
      });
      // Keyframe every ~2 seconds.
      encoder.encode(frame, { keyFrame: i % (o.fps * 2) === 0 });
      frame.close();

      o.onProgress?.(((i + 1) / o.total) * 0.95);
      // Relieve backpressure and let the UI update.
      if (encoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r));
      }
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
  } finally {
    try {
      encoder.close();
    } catch {
      // already closed
    }
    renderer.endExport();
  }

  const { buffer } = muxer.target as ArrayBufferTarget;
  o.onProgress?.(1);
  return { blob: new Blob([buffer], { type: 'video/mp4' }), ext: 'mp4' };
}

interface MediaRecorderOpts {
  durationSec: number;
  fps: number;
  onProgress?: (p: number) => void;
}

async function exportWithMediaRecorder(
  renderer: Renderer,
  o: MediaRecorderOpts,
): Promise<ExportResult> {
  const canvas = renderer.getCanvas();
  const stream = canvas.captureStream(o.fps);
  const mime = MediaRecorder.isTypeSupported('video/mp4')
    ? 'video/mp4'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => {
    recorder.onstop = () => res();
  });

  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / (o.durationSec * 1000));
      o.onProgress?.(p * 0.99);
      if (p >= 1) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  recorder.stop();
  await stopped;

  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  o.onProgress?.(1);
  return { blob: new Blob(chunks, { type: mime }), ext };
}
