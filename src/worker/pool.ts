import type { ClipInput, FrameData } from '../types.js';
import type { WorkerInbound, WorkerOutbound, TransferableFrame } from './protocol.js';

const ASPECT_RATIO_MAP: Record<string, [number, number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:3': [4, 3],
  '3:4': [3, 4],
  original: [0, 0],
};

function resolveOutputDimensions(
  clip: ClipInput,
  videoWidth: number,
  videoHeight: number,
  width: number,
  height: number
): [number, number] {
  const ar = clip.aspectRatio ?? 'original';
  const ratio = ASPECT_RATIO_MAP[ar] ?? [0, 0];
  if (ratio[0] === 0) return [width, height];
  const w = width;
  const h = Math.round(w * (ratio[1] / ratio[0]));
  return [w, h];
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001) { resolve(); return; }
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  clip: ClipInput,
  outW: number,
  outH: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (clip.crop) {
    const { x, y, width, height } = clip.crop;
    ctx.drawImage(video, x * vw, y * vh, width * vw, height * vh, 0, 0, outW, outH);
  } else {
    const videoAR = vw / vh;
    const outAR = outW / outH;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoAR > outAR) {
      sw = vh * outAR;
      sx = (vw - sw) / 2;
    } else if (videoAR < outAR) {
      sh = vw / outAR;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  }
}

export class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly available: Worker[] = [];
  private readonly waiters: Array<(w: Worker) => void> = [];

  constructor(maxConcurrency: number) {
    for (let i = 0; i < maxConcurrency; i++) {
      const w = new Worker(new URL('./worker/render-worker.js', import.meta.url), { type: 'module' });
      this.workers.push(w);
      this.available.push(w);
    }
  }

  private acquire(): Promise<Worker> {
    if (this.available.length > 0) return Promise.resolve(this.available.pop()!);
    return new Promise(resolve => this.waiters.push(resolve));
  }

  private release(worker: Worker): void {
    if (this.waiters.length > 0) {
      this.waiters.shift()!(worker);
    } else {
      this.available.push(worker);
    }
  }

  async dispatch(
    clip: ClipInput,
    width: number,
    height: number,
    fps: number,
    signal?: AbortSignal,
    onProgress?: (p: number) => void
  ): Promise<FrameData[]> {
    const worker = await this.acquire();
    try {
      return await this.processClip(worker, clip, width, height, fps, signal, onProgress);
    } finally {
      this.release(worker);
    }
  }

  private async processClip(
    worker: Worker,
    clip: ClipInput,
    width: number,
    height: number,
    fps: number,
    signal?: AbortSignal,
    onProgress?: (p: number) => void
  ): Promise<FrameData[]> {
    let srcUrl: string;
    let needsRevoke = false;

    if (typeof clip.source === 'string') {
      srcUrl = clip.source;
    } else if (clip.source instanceof HTMLVideoElement) {
      srcUrl = clip.source.src;
    } else {
      srcUrl = URL.createObjectURL(clip.source as Blob);
      needsRevoke = true;
    }

    const video = document.createElement('video');
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`Failed to load video: ${srcUrl}`));
      video.src = srcUrl;
    });

    const duration = video.duration;
    const startTime = clip.startTime ?? 0;
    const endTime = clip.endTime ?? duration;
    const clipDuration = endTime - startTime;
    const [outW, outH] = resolveOutputDimensions(clip, video.videoWidth, video.videoHeight, width, height);
    const totalFrames = Math.ceil(clipDuration * fps);

    // Temp canvas applies crop/aspect-ratio before handing bitmap to worker
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;

    // Wire up worker message handler before sending init
    const resultPromise = new Promise<TransferableFrame[]>((resolve, reject) => {
      const onMessage = (e: MessageEvent<WorkerOutbound>) => {
        const msg = e.data;
        if (msg.type === 'done') {
          worker.removeEventListener('message', onMessage);
          resolve(msg.frames);
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', onMessage);
          reject(new Error(msg.message));
        } else if (msg.type === 'progress') {
          onProgress?.(msg.value);
        }
      };
      worker.addEventListener('message', onMessage);
    });

    const initMsg: WorkerInbound = {
      type: 'init',
      meta: { width: outW, height: outH, fps, captions: clip.captions, totalFrames },
    };
    worker.postMessage(initMsg);

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (signal?.aborted) {
          worker.postMessage({ type: 'abort' } satisfies WorkerInbound);
          throw new DOMException('Render cancelled', 'AbortError');
        }

        const t = startTime + (i / fps);
        await seekVideo(video, t);
        ctx.clearRect(0, 0, outW, outH);
        drawVideoFrame(ctx, video, clip, outW, outH);

        const bitmap = await createImageBitmap(canvas);
        const frameMsg: WorkerInbound = { type: 'frame', bitmap, timestamp: t - startTime, index: i };
        worker.postMessage(frameMsg, [bitmap]);
      }

      worker.postMessage({ type: 'end' } satisfies WorkerInbound);
      const transferableFrames = await resultPromise;

      return transferableFrames.map(f => ({
        imageData: new ImageData(new Uint8ClampedArray(f.buffer), f.width, f.height),
        timestamp: f.timestamp,
        width: f.width,
        height: f.height,
      }));
    } finally {
      if (needsRevoke) URL.revokeObjectURL(srcUrl);
    }
  }

  terminate(): void {
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
    this.available.length = 0;
  }
}
