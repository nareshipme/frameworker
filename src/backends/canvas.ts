import type { ClipSource, MergeOptions, RenderMetrics, ClipMetrics, ClipProgress } from '../types.js';
import { STYLE_PRESETS, mergeStyle, getActiveCaptions, renderCaption } from '../captions.js';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
}

const ASPECT_RATIO_MAP: Record<string, [number, number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:3': [4, 3],
  '3:4': [3, 4],
  original: [0, 0],
};

interface Layout {
  canvasW: number;
  canvasH: number;
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
}

function computeLayout(clip: ClipSource, videoW: number, videoH: number): Layout {
  const ar = clip.aspectRatio ?? 'original';
  const ratio = ASPECT_RATIO_MAP[ar] ?? [0, 0];
  const canvasW = ratio[0] === 0 ? videoW : 1280;
  const canvasH = ratio[0] === 0 ? videoH : Math.round(canvasW * (ratio[1] / ratio[0]));

  if (clip.crop) {
    const { x, y, width, height } = clip.crop;
    return {
      canvasW,
      canvasH,
      srcX: x * videoW,
      srcY: y * videoH,
      srcW: width * videoW,
      srcH: height * videoH,
    };
  }

  const outAR = canvasW / canvasH;
  const srcAR = videoW / videoH;
  let srcX = 0, srcY = 0, srcW = videoW, srcH = videoH;
  if (srcAR > outAR) {
    srcW = videoH * outAR;
    srcX = (videoW - srcW) / 2;
  } else if (srcAR < outAR) {
    srcH = videoW / outAR;
    srcY = (videoH - srcH) / 2;
  }
  return { canvasW, canvasH, srcX, srcY, srcW, srcH };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001) {
      resolve();
      return;
    }
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = time;
  });
}

interface RecordOptions {
  signal?: AbortSignal;
  onProgress?: (p: number) => void;
}

export async function recordClip(
  srcUrl: string,
  clip: ClipSource,
  opts: RecordOptions = {}
): Promise<Blob> {
  const { signal, onProgress } = opts;

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.muted = true;
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px';
  document.body.appendChild(video);

  let audioCtx: AudioContext | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error(`Failed to load video: ${srcUrl}`)), {
        once: true,
      });
      video.src = srcUrl;
    });

    const startTime = clip.startTime ?? 0;
    const endTime = clip.endTime ?? video.duration;
    const duration = endTime - startTime;

    await seekTo(video, startTime);
    if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

    const { canvasW, canvasH, srcX, srcY, srcW, srcH } = computeLayout(
      clip,
      video.videoWidth,
      video.videoHeight
    );

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    const canvasStream = canvas.captureStream(30);

    try {
      audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const audioSrc = audioCtx.createMediaElementSource(video);
      const audioDest = audioCtx.createMediaStreamDestination();
      const gain = audioCtx.createGain();
      gain.gain.value = clip.volume ?? 1;
      audioSrc.connect(gain);
      gain.connect(audioDest);
      audioDest.stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    } catch {
      // no audio track or CORS restriction — continue video-only
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(canvasStream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const captionSegs = clip.captions?.segments ?? [];
    const baseStyle = mergeStyle(
      STYLE_PRESETS[clip.captions?.style?.preset ?? 'modern'],
      clip.captions?.style
    );

    return await new Promise<Blob>((resolve, reject) => {
      let rafId = 0;
      // eslint-disable-next-line prefer-const
      let intervalId: ReturnType<typeof setInterval>;
      let aborted = false;

      function stop() {
        cancelAnimationFrame(rafId);
        clearInterval(intervalId);
        if (recorder.state !== 'inactive') recorder.stop();
        video.pause();
      }

      function drawFrame() {
        ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvasW, canvasH);
        const clipTime = video.currentTime - startTime;
        for (const seg of getActiveCaptions(captionSegs, clipTime)) {
          renderCaption(ctx, seg, mergeStyle(baseStyle, seg.style), canvasW, canvasH);
        }
        if (video.currentTime < endTime) {
          rafId = requestAnimationFrame(drawFrame);
        } else {
          stop();
        }
      }

      recorder.onstop = () => {
        if (!aborted) resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.onerror = () => reject(new Error('Recording failed'));

      recorder.start(100);
      video.play().catch(reject);
      rafId = requestAnimationFrame(drawFrame);

      const startWall = Date.now();
      intervalId = setInterval(() => {
        if (signal?.aborted) {
          aborted = true;
          stop();
          reject(new DOMException('Render cancelled', 'AbortError'));
          return;
        }
        const elapsed = (Date.now() - startWall) / 1000;
        onProgress?.(Math.min(elapsed / duration, 0.99));
      }, 200);

      video.addEventListener('ended', stop, { once: true });
    });
  } finally {
    video.remove();
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }
  }
}

function resolveUrl(clip: ClipSource): { url: string; needsRevoke: boolean } {
  if (typeof clip.source === 'string') return { url: clip.source, needsRevoke: false };
  if (clip.source instanceof HTMLVideoElement) return { url: clip.source.src, needsRevoke: false };
  return { url: URL.createObjectURL(clip.source as Blob), needsRevoke: true };
}

export async function recordClips(
  clips: ClipSource[],
  options: MergeOptions = {}
): Promise<{ blob: Blob; metrics: RenderMetrics }> {
  const { onProgress, onComplete, signal } = options;
  const startAll = performance.now();

  const clipStatuses: ClipProgress[] = clips.map((_, i) => ({
    index: i,
    status: 'pending' as const,
    progress: 0,
  }));
  const clipMetrics: ClipMetrics[] = [];

  function emit(overall: number) {
    onProgress?.({ overall, clips: clipStatuses.slice() });
  }

  const blobs: Blob[] = [];

  for (let ci = 0; ci < clips.length; ci++) {
    if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');

    clipStatuses[ci].status = 'rendering';
    emit(ci / clips.length);

    const { url, needsRevoke } = resolveUrl(clips[ci]);
    const clipStart = performance.now();

    try {
      const blob = await recordClip(url, clips[ci], {
        signal,
        onProgress: (p) => {
          clipStatuses[ci].progress = p;
          emit((ci + p) / clips.length);
        },
      });
      blobs.push(blob);
    } finally {
      if (needsRevoke) URL.revokeObjectURL(url);
    }

    const clipMs = performance.now() - clipStart;
    clipStatuses[ci].status = 'done';
    clipStatuses[ci].progress = 1;
    clipMetrics.push({
      clipId: String(ci),
      extractionMs: clipMs,
      encodingMs: 0,
      totalMs: clipMs,
      framesExtracted: 0,
    });
    emit((ci + 1) / clips.length);
  }

  onProgress?.({ overall: 1, clips: clipStatuses.map((s) => ({ ...s, progress: 1 })) });

  const finalBlob =
    blobs.length === 1 ? blobs[0] : new Blob(blobs, { type: blobs[0].type });

  const totalMs = performance.now() - startAll;
  const metrics: RenderMetrics = {
    totalMs,
    extractionMs: totalMs,
    encodingMs: 0,
    stitchMs: 0,
    clips: clipMetrics,
    framesPerSecond: 0,
  };

  onComplete?.(metrics);
  return { blob: finalBlob, metrics };
}

export function isCanvasRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  );
}
