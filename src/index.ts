// ── Type exports ─────────────────────────────────────────────────────────────

export type {
  // Core
  ClipSource,
  CaptionSegment,
  CaptionStyle,
  CaptionStylePreset,
  AspectRatio,
  CropOptions,
  CaptionOptions,
  RenderOptions,
  EncodeOptions,
  FrameData,
  RendererBackend,
  FrameWorkerConfig,
  FrameWorker,
  // Progress & metrics
  ClipStatus,
  ClipProgress,
  RichProgress,
  ClipMetrics,
  RenderMetrics,
  // v0.2 API options
  MergeOptions,
  ExportOptions,
  Segment,
  // Deprecated aliases (kept for soft migration)
  ClipInput,
  StitchOptions,
  SingleVideoRenderOptions,
} from './types.js';

// ── Value exports ─────────────────────────────────────────────────────────────

export { STYLE_PRESETS } from './captions.js';
export { FFmpegBackend, createFFmpegBackend } from './backends/ffmpeg.js';
export { WebCodecsBackend, createWebCodecsBackend, isWebCodecsSupported } from './backends/webcodecs.js';

// v0.2 top-level API
export { exportClips, exportClipsToUrl } from './render.js';

// Deprecated aliases (soft migration — will be removed in v0.3)
/** @deprecated Use exportClips() */
export { render } from './render.js';
/** @deprecated Use exportClipsToUrl() */
export { renderToUrl } from './render.js';

// ── createFrameWorker ─────────────────────────────────────────────────────────

import type { ClipSource, RenderOptions, MergeOptions, RenderMetrics, FrameWorkerConfig, FrameWorker, RendererBackend } from './types.js';
import { extractFrames } from './compositor.js';
import { stitchClips } from './stitch.js';

export function createFrameWorker(config: FrameWorkerConfig = {}): FrameWorker {
  const fps = config.fps ?? 30;
  const width = config.width ?? 1280;
  const height = config.height ?? 720;

  let _backend: RendererBackend | null = config.backend ?? null;

  async function getBackend(): Promise<RendererBackend> {
    if (!_backend) {
      const { isWebCodecsSupported, createWebCodecsBackend } = await import('./backends/webcodecs.js');
      if (isWebCodecsSupported()) {
        _backend = createWebCodecsBackend();
      } else {
        const { createFFmpegBackend } = await import('./backends/ffmpeg.js');
        _backend = createFFmpegBackend();
      }
    }
    await _backend.init();
    return _backend;
  }

  async function render(clip: ClipSource, options: RenderOptions = {}): Promise<Blob> {
    const mergedOpts: RenderOptions = { fps, width, height, ...options };
    const backend = await getBackend();

    const onProgress = mergedOpts.onProgress;
    const frames = await extractFrames(clip, {
      ...mergedOpts,
      onProgress: onProgress ? (p) => onProgress(p * 0.85) : undefined,
    });

    return backend.encode(frames, {
      width: mergedOpts.width ?? width,
      height: mergedOpts.height ?? height,
      fps: mergedOpts.fps ?? fps,
      mimeType: mergedOpts.mimeType ?? 'video/mp4',
      quality: mergedOpts.quality ?? 0.92,
      encoderOptions: mergedOpts.encoderOptions,
      onProgress: onProgress ? (p) => onProgress(0.85 + p * 0.15) : undefined,
      signal: mergedOpts.signal,
    });
  }

  async function renderToUrl(clip: ClipSource, options?: RenderOptions): Promise<string> {
    const blob = await render(clip, options);
    return URL.createObjectURL(blob);
  }

  async function mergeClips(clips: ClipSource[], options: MergeOptions = {}): Promise<{ blob: Blob; metrics: RenderMetrics }> {
    const mergedOpts: MergeOptions = { fps, width, height, ...options };
    const backend = await getBackend();
    return stitchClips(clips, backend, mergedOpts);
  }

  async function mergeClipsToUrl(clips: ClipSource[], options?: MergeOptions): Promise<{ url: string; metrics: RenderMetrics }> {
    const { blob, metrics } = await mergeClips(clips, options);
    return { url: URL.createObjectURL(blob), metrics };
  }

  return {
    render,
    renderToUrl,
    mergeClips,
    mergeClipsToUrl,
    /** @deprecated Use mergeClips() */
    stitch: mergeClips,
    /** @deprecated Use mergeClipsToUrl() */
    stitchToUrl: mergeClipsToUrl,
  };
}
