import type { Segment, ExportOptions, RenderMetrics, ClipSource, RendererBackend } from './types.js';
import { stitchClips } from './stitch.js';

function segmentsToClips(videoUrl: string, segments: Segment[]): ClipSource[] {
  return segments.map((seg) => ({
    source: videoUrl,
    startTime: seg.start,
    endTime: seg.end,
    captions: seg.captions?.length ? { segments: seg.captions } : undefined,
  }));
}

async function resolveBackend(override?: RendererBackend): Promise<RendererBackend> {
  if (override) {
    await override.init();
    return override;
  }

  // Default: WebCodecs (hardware-accelerated, no CDN deps).
  // Falls back to FFmpegBackend for browsers without WebCodecs support.
  const { isWebCodecsSupported, createWebCodecsBackend } = await import('./backends/webcodecs.js');
  if (isWebCodecsSupported()) {
    const backend = createWebCodecsBackend();
    await backend.init();
    return backend;
  }

  const { createFFmpegBackend } = await import('./backends/ffmpeg.js');
  const backend = createFFmpegBackend();
  await backend.init();
  return backend;
}

export async function exportClips(
  videoUrl: string,
  segments: Segment[],
  options?: ExportOptions
): Promise<{ blob: Blob; metrics: RenderMetrics }> {
  const clips = segmentsToClips(videoUrl, segments);
  const backend = await resolveBackend(options?.backend);
  return stitchClips(clips, backend, options ?? {});
}

export async function exportClipsToUrl(
  videoUrl: string,
  segments: Segment[],
  options?: ExportOptions
): Promise<{ url: string; metrics: RenderMetrics }> {
  const { blob, metrics } = await exportClips(videoUrl, segments, options);
  return { url: URL.createObjectURL(blob), metrics };
}

/** @deprecated Use exportClips() */
export const render = exportClips;

/** @deprecated Use exportClipsToUrl() */
export const renderToUrl = exportClipsToUrl;
