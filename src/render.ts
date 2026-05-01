import type { Segment, ExportOptions, RenderMetrics, ClipSource } from './types.js';
import { recordClips } from './backends/canvas.js';

function segmentsToClips(videoUrl: string, segments: Segment[]): ClipSource[] {
  return segments.map((seg) => ({
    source: videoUrl,
    startTime: seg.start,
    endTime: seg.end,
    captions: seg.captions?.length ? { segments: seg.captions } : undefined,
  }));
}

export async function exportClips(
  videoUrl: string,
  segments: Segment[],
  options?: ExportOptions
): Promise<{ blob: Blob; metrics: RenderMetrics }> {
  const clips = segmentsToClips(videoUrl, segments);
  return recordClips(clips, options ?? {});
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
