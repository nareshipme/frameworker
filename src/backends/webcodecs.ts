import type { RendererBackend, FrameData, EncodeOptions } from '../types.js';

// ── Codec detection ───────────────────────────────────────────────────────────

// Ordered best → most compatible. All produce H.264 in an MP4 container.
const H264_CANDIDATES = [
  'avc1.640034', // High Profile L5.2 — best quality/size ratio, hardware on most devices
  'avc1.4D0034', // Main Profile L5.2
  'avc1.42001f', // Baseline Profile L3.1 — widest compatibility
];

async function pickCodec(width: number, height: number, fps: number): Promise<string> {
  for (const codec of H264_CANDIDATES) {
    const { supported } = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      framerate: fps,
      bitrate: 4_000_000,
    });
    if (supported) return codec;
  }
  throw new Error('[FrameWorker] No supported H.264 VideoEncoder codec found in this browser.');
}

// ── Support check ─────────────────────────────────────────────────────────────

export function isWebCodecsSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof EncodedVideoChunk !== 'undefined'
  );
}

// ── WebCodecsBackend ──────────────────────────────────────────────────────────

export class WebCodecsBackend implements RendererBackend {
  readonly name = 'webcodecs';

  async init(): Promise<void> {
    if (!isWebCodecsSupported()) {
      throw new Error(
        '[FrameWorker] WebCodecs is not supported in this browser. ' +
          'Pass a FFmpegBackend instance as the `backend` option instead.'
      );
    }
  }

  async encode(frames: FrameData[], options: EncodeOptions): Promise<Blob> {
    if (frames.length === 0) return new Blob([], { type: 'video/mp4' });

    const { width, height, fps, onProgress, signal } = options;
    const frameDuration = Math.round(1_000_000 / fps); // µs

    // Dynamically import mp4-muxer so it's tree-shaken when not used
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

    const codec = await pickCodec(width, height, fps);

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width, height },
      fastStart: 'in-memory',
    });

    let encoderError: Error | null = null;

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      },
    });

    encoder.configure({
      codec,
      width,
      height,
      bitrate: computeBitrate(width, height, fps),
      framerate: fps,
      avc: { format: 'avc' }, // AVCC format required by mp4-muxer
    });

    const keyInterval = Math.round(fps * 2); // keyframe every 2 s

    for (let i = 0; i < frames.length; i++) {
      if (signal?.aborted) {
        encoder.close();
        throw new DOMException('Render cancelled', 'AbortError');
      }
      if (encoderError) throw encoderError;

      const frame = frames[i];
      const timestamp = Math.round(frame.timestamp * 1_000_000); // µs

      // Use BufferSource constructor — no ImageBitmap round-trip needed
      const videoFrame = new VideoFrame(frame.imageData.data, {
        format: 'RGBA',
        codedWidth: width,
        codedHeight: height,
        timestamp,
        duration: frameDuration,
      });

      encoder.encode(videoFrame, { keyFrame: i % keyInterval === 0 });
      videoFrame.close();

      onProgress?.(i / frames.length);
    }

    await encoder.flush();

    if (encoderError) throw encoderError;

    encoder.close();
    muxer.finalize();

    onProgress?.(1);

    return new Blob([target.buffer], { type: 'video/mp4' });
  }

  async concat(blobs: Blob[], options: EncodeOptions): Promise<Blob> {
    if (blobs.length === 1) return blobs[0];

    // For multi-clip concat, delegate to FFmpegBackend (-c copy, no re-encode).
    // @ffmpeg/ffmpeg is already an optional peer dep, and concat is fast because
    // it only remuxes — it doesn't re-encode anything.
    const { FFmpegBackend } = await import('./ffmpeg.js');
    const backend = new FFmpegBackend();
    await backend.init();
    try {
      return await backend.concat(blobs, options);
    } finally {
      await backend.destroy?.();
    }
  }
}

export function createWebCodecsBackend(): WebCodecsBackend {
  return new WebCodecsBackend();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Target ~2 bits/pixel/frame, capped at 8 Mbps to avoid memory pressure.
 * This gives roughly 2.5 Mbps at 1280×720@30fps and 5 Mbps at 1920×1080@30fps.
 */
function computeBitrate(width: number, height: number, fps: number): number {
  const bitsPerPixelPerFrame = 0.07;
  const raw = width * height * fps * bitsPerPixelPerFrame;
  return Math.min(Math.round(raw), 8_000_000);
}
