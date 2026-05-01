export type {
  ClipSource,
  CaptionSegment,
  CaptionStyle,
  CaptionStylePreset,
  AspectRatio,
  CropOptions,
  CaptionOptions,
  RenderOptions,
  FrameWorkerConfig,
  FrameWorker,
  ClipStatus,
  ClipProgress,
  RichProgress,
  ClipMetrics,
  RenderMetrics,
  MergeOptions,
  ExportOptions,
  Segment,
  ClipInput,
  StitchOptions,
  SingleVideoRenderOptions,
  EncodeOptions,
  FrameData,
  RendererBackend,
} from './types.js';

export { STYLE_PRESETS } from './captions.js';
export { isCanvasRecordingSupported } from './backends/canvas.js';

export { exportClips, exportClipsToUrl } from './render.js';

/** @deprecated Use exportClips() */
export { render } from './render.js';
/** @deprecated Use exportClipsToUrl() */
export { renderToUrl } from './render.js';

import type { ClipSource, RenderOptions, MergeOptions, RenderMetrics, FrameWorkerConfig, FrameWorker } from './types.js';
import { recordClip, recordClips } from './backends/canvas.js';

function resolveUrl(clip: ClipSource): { url: string; needsRevoke: boolean } {
  if (typeof clip.source === 'string') return { url: clip.source, needsRevoke: false };
  if (clip.source instanceof HTMLVideoElement) return { url: clip.source.src, needsRevoke: false };
  return { url: URL.createObjectURL(clip.source as Blob), needsRevoke: true };
}

export function createFrameWorker(_config: FrameWorkerConfig = {}): FrameWorker {
  async function render(clip: ClipSource, options: RenderOptions = {}): Promise<Blob> {
    const { url, needsRevoke } = resolveUrl(clip);
    try {
      return await recordClip(url, clip, { signal: options.signal, onProgress: options.onProgress });
    } finally {
      if (needsRevoke) URL.revokeObjectURL(url);
    }
  }

  async function renderToUrl(clip: ClipSource, options?: RenderOptions): Promise<string> {
    const blob = await render(clip, options);
    return URL.createObjectURL(blob);
  }

  async function mergeClips(clips: ClipSource[], options: MergeOptions = {}): Promise<{ blob: Blob; metrics: RenderMetrics }> {
    return recordClips(clips, options);
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
