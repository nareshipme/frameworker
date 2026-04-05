import type { ClipInput, RendererBackend, FrameData, ClipProgress, StitchOptions, ClipMetrics, RenderMetrics } from './types.js';
import { extractFrames } from './compositor.js';
import { WorkerPool } from './worker/pool.js';

function supportsOffscreenWorkers(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
}

export async function stitchClips(
  clips: ClipInput[],
  backend: RendererBackend,
  options: StitchOptions
): Promise<{ blob: Blob; metrics: RenderMetrics }> {
  if (supportsOffscreenWorkers() && clips.length > 1) {
    return stitchParallel(clips, backend, options);
  }
  return stitchSequential(clips, backend, options);
}

// ── Sequential fallback (older browsers / single clip) ────────────────────────

async function stitchSequential(
  clips: ClipInput[],
  backend: RendererBackend,
  options: StitchOptions
): Promise<{ blob: Blob; metrics: RenderMetrics }> {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const { onProgress, onComplete, signal } = options;

  const stitchStart = performance.now();

  const clipStatuses: ClipProgress[] = clips.map((_, i) => ({
    index: i, status: 'pending', progress: 0,
  }));
  const clipMetrics: ClipMetrics[] = [];

  const emit = (overall: number) => {
    onProgress?.({ overall, clips: clipStatuses.slice() });
  };

  const blobs: Blob[] = [];

  for (let ci = 0; ci < clips.length; ci++) {
    clipStatuses[ci].status = 'rendering';
    emit(ci / clips.length);

    const extractStart = performance.now();
    const frames = await extractFrames(clips[ci], {
      fps, width, height,
      mimeType: options.mimeType,
      quality: options.quality,
      encoderOptions: options.encoderOptions,
      signal,
      onProgress: (p) => {
        clipStatuses[ci].progress = p * 0.9;
        emit((ci + p * 0.9) / clips.length);
      },
    });
    const extractionMs = performance.now() - extractStart;

    clipStatuses[ci].status = 'encoding';
    const encodeStart = performance.now();
    const blob = await backend.encode(frames, {
      width, height, fps,
      mimeType: options.mimeType ?? 'video/mp4',
      quality: options.quality ?? 0.92,
      encoderOptions: options.encoderOptions,
      signal,
      onProgress: (p) => {
        clipStatuses[ci].progress = 0.9 + p * 0.1;
        emit((ci + 0.9 + p * 0.1) / clips.length);
      },
    });
    const encodingMs = performance.now() - encodeStart;

    clipStatuses[ci].status = 'done';
    clipStatuses[ci].progress = 1;
    clipMetrics.push({
      clipId: String(ci),
      extractionMs,
      encodingMs,
      totalMs: extractionMs + encodingMs,
      framesExtracted: frames.length,
    });
    blobs.push(blob);
  }

  let finalBlob: Blob;
  let stitchMs = 0;

  if (blobs.length === 1) {
    emit(1);
    finalBlob = blobs[0];
  } else {
    const stitchPhaseStart = performance.now();
    finalBlob = await backend.concat(blobs, {
      width, height, fps,
      mimeType: options.mimeType ?? 'video/mp4',
      quality: options.quality ?? 0.92,
      signal,
      onProgress: (p) => emit((clips.length - 1 + p) / clips.length),
    });
    stitchMs = performance.now() - stitchPhaseStart;
  }

  const totalMs = performance.now() - stitchStart;
  const totalFrames = clipMetrics.reduce((s, c) => s + c.framesExtracted, 0);
  const metrics: RenderMetrics = {
    totalMs,
    extractionMs: clipMetrics.reduce((s, c) => s + c.extractionMs, 0),
    encodingMs: clipMetrics.reduce((s, c) => s + c.encodingMs, 0),
    stitchMs,
    clips: clipMetrics,
    framesPerSecond: totalFrames / (totalMs / 1000),
  };

  onComplete?.(metrics);
  return { blob: finalBlob, metrics };
}

// ── Parallel path (OffscreenCanvas + WorkerPool) ──────────────────────────────

async function stitchParallel(
  clips: ClipInput[],
  backend: RendererBackend,
  options: StitchOptions
): Promise<{ blob: Blob; metrics: RenderMetrics }> {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const { onProgress, onComplete, signal } = options;

  const stitchStart = performance.now();

  const concurrency = Math.min(
    clips.length,
    (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2),
    4
  );

  const clipStatuses: ClipProgress[] = clips.map((_, i) => ({
    index: i, status: 'pending', progress: 0,
  }));
  const clipMetrics: Array<ClipMetrics> = new Array(clips.length);

  const emit = () => {
    const overall = clipStatuses.reduce((sum, c) => sum + c.progress, 0) / clips.length;
    onProgress?.({ overall, clips: clipStatuses.slice() });
  };

  const pool = new WorkerPool(concurrency);
  const blobs: Blob[] = new Array(clips.length);
  let encodeChain = Promise.resolve();

  try {
    await Promise.all(
      clips.map(async (clip, ci) => {
        clipStatuses[ci].status = 'rendering';
        emit();

        const extractStart = performance.now();
        const frames: FrameData[] = await pool.dispatch(
          clip, width, height, fps, signal,
          (p) => {
            clipStatuses[ci].progress = p * 0.85;
            emit();
          }
        );
        const extractionMs = performance.now() - extractStart;

        clipStatuses[ci].status = 'encoding';
        clipStatuses[ci].progress = 0.85;
        emit();

        await new Promise<void>((resolve, reject) => {
          encodeChain = encodeChain.then(async () => {
            const encodeStart = performance.now();
            try {
              blobs[ci] = await backend.encode(frames, {
                width, height, fps,
                mimeType: options.mimeType ?? 'video/mp4',
                quality: options.quality ?? 0.92,
                encoderOptions: options.encoderOptions,
                signal,
                onProgress: (p) => {
                  clipStatuses[ci].progress = 0.85 + p * 0.15;
                  emit();
                },
              });
              const encodingMs = performance.now() - encodeStart;
              clipMetrics[ci] = {
                clipId: String(ci),
                extractionMs,
                encodingMs,
                totalMs: extractionMs + encodingMs,
                framesExtracted: frames.length,
              };
              clipStatuses[ci].status = 'done';
              clipStatuses[ci].progress = 1;
              emit();
              resolve();
            } catch (err) {
              clipStatuses[ci].status = 'error';
              reject(err);
              throw err;
            }
          });
        });
      })
    );

    let finalBlob: Blob;
    let stitchMs = 0;

    if (blobs.length === 1) {
      onProgress?.({ overall: 1, clips: clipStatuses.slice() });
      finalBlob = blobs[0];
    } else {
      const stitchPhaseStart = performance.now();
      finalBlob = await backend.concat(blobs, {
        width, height, fps,
        mimeType: options.mimeType ?? 'video/mp4',
        quality: options.quality ?? 0.92,
        signal,
      });
      stitchMs = performance.now() - stitchPhaseStart;
    }

    const totalMs = performance.now() - stitchStart;
    const totalFrames = clipMetrics.reduce((s, c) => s + c.framesExtracted, 0);
    const metrics: RenderMetrics = {
      totalMs,
      extractionMs: clipMetrics.reduce((s, c) => s + c.extractionMs, 0),
      encodingMs: clipMetrics.reduce((s, c) => s + c.encodingMs, 0),
      stitchMs,
      clips: clipMetrics,
      framesPerSecond: totalFrames / (totalMs / 1000),
    };

    onComplete?.(metrics);
    return { blob: finalBlob, metrics };
  } finally {
    pool.terminate();
  }
}
