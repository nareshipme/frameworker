# FrameWorker

**Browser-native video rendering and clip export.** Trim, caption, and export MP4 Blobs entirely in the browser — no server, no upload, no backend.

[![npm](https://img.shields.io/npm/v/framewebworker)](https://www.npmjs.com/package/framewebworker)
[![CI](https://github.com/nareshipme/framewebworker/actions/workflows/ci.yml/badge.svg)](https://github.com/nareshipme/framewebworker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Export segments** from a single source video with `exportClips()`
- **Merge clips** from multiple source videos with `mergeClips()`
- **Overlay captions** with built-in style presets (`hormozi`, `modern`, `minimal`, `bold`)
- **Parallel rendering** via OffscreenCanvas + Web Workers — automatic on supported browsers
- **Timing metrics** — per-segment extraction/encoding times, overall FPS throughput
- **WebCodecs by default** — hardware-accelerated H.264 encoding with automatic fallback to ffmpeg.wasm
- **Pluggable renderer backend** — swap encoders via `ExportOptions.backend`
- **Framework-agnostic core** + React hooks (`framewebworker/react`)
- **TypeScript-first** with full type exports
- Respects `AbortSignal` for cancellation

## Install

```bash
npm install framewebworker
```

The default backend uses the browser's native **WebCodecs API** (Chrome/Edge 94+) and requires no extra packages. For multi-clip concat or as a fallback on browsers without WebCodecs, `@ffmpeg/ffmpeg` is used automatically — install it if you need those code paths:

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

> `@ffmpeg/ffmpeg` and `@ffmpeg/util` are optional peer dependencies. `mp4-muxer` is a direct dependency bundled automatically.

---

## Which API should I use?

| | `exportClips()` | `mergeClips()` |
|---|---|---|
| **Source videos** | One URL, multiple time ranges | Multiple clips, each with its own source |
| **Best for** | Highlight reels, chapter exports, clip editors | Joining footage from different files |
| **Video loading** | Loads the source once, seeks per segment | Loads each source independently |
| **React hook** | `useExportClips(videoUrl, segments)` | `useMergeClips(fw)` |

Both produce a single concatenated MP4 `Blob` and return `RenderMetrics`.

---

## Performance

### What affects render time

| Factor | Impact |
|--------|--------|
| Source resolution | 1080p takes ~2–3× longer to extract than 720p (more pixels per frame) |
| Segment / clip count | More clips = more parallel extraction workers, but encoding stays serial |
| `hardwareConcurrency` | Worker concurrency is capped at `Math.min(clips, hardwareConcurrency, 4)` |
| OffscreenCanvas support | Chrome/Edge 94+ run extraction in parallel workers; older browsers fall back to sequential single-threaded extraction |
| ffmpeg.wasm init | First call pays a ~1–2s WASM load cost; subsequent calls on the same instance are fast |

### Benchmarks

These are ballpark figures on a quiet tab with no other heavy work running. Real numbers vary with source bitrate, codec, and device thermals. **v0.3+ uses WebCodecs by default** — encoding is hardware-accelerated and 10–50× faster than the previous ffmpeg.wasm default.

| Scenario | Desktop (WebCodecs) | Desktop (ffmpeg fallback) | Mobile (WebCodecs) |
|----------|---------------------|---------------------------|--------------------|
| 3 × 10s clips, 720p | ~0.5–1s | ~4–6s | ~1–3s |
| 3 × 10s clips, 1080p | ~1–2s | ~10–14s | ~3–6s |
| 10 × 5s clips, 720p | ~1–2s | ~10–14s | ~3–6s |
| 1 × 30s clip, 720p | ~0.5–1s | ~5–8s | ~1–3s |

**Extraction is parallel** — one Web Worker per clip/segment, capped at `Math.min(clips, hardwareConcurrency, 4)`. **Encoding** uses hardware-accelerated WebCodecs where available; the ffmpeg.wasm fallback encodes serially.

### Reading metrics at runtime

Both `exportClips()` and `mergeClips()` return `{ blob, metrics }`. Use `onComplete` to log a breakdown without waiting on the returned promise:

```ts
import { exportClips } from 'framewebworker';

const { blob, metrics } = await exportClips(videoUrl, segments, {
  onComplete: (m) => {
    console.log(`Total: ${(m.totalMs / 1000).toFixed(2)}s`);
    console.log(`Throughput: ${m.framesPerSecond.toFixed(1)} fps`);
    console.log(`Extraction: ${m.extractionMs.toFixed(0)}ms  Encoding: ${m.encodingMs.toFixed(0)}ms  Concat: ${m.stitchMs.toFixed(0)}ms`);

    m.clips.forEach((c) => {
      console.log(
        `  segment ${c.clipId}: ${c.framesExtracted} frames, ` +
        `extract ${c.extractionMs.toFixed(0)}ms, encode ${c.encodingMs.toFixed(0)}ms`
      );
    });
  },
});
```

See [`RenderMetrics`](#rendermetrics--timing-output) for the full type definition.

### Tips to improve performance

- **Prefer 720p source** when export quality allows — extraction cost scales with pixel count, so halving resolution cuts extraction time by ~4×.
- **Keep segments short** — encoding time scales linearly with frame count. Ten 5s clips encode faster than two 25s clips, and extraction of the ten clips runs in parallel.
- **Expect 2–3× slower on mobile** — `hardwareConcurrency` is typically 4–8 on desktop but 2–4 on phones, so fewer workers run in parallel and each core is slower.
- **Reuse a `FrameWorker` instance** (for `mergeClips`) — the WebCodecs backend is stateless, but reusing avoids re-running codec detection. If ffmpeg.wasm is active, it only loads once per instance.

---

## `exportClips()` — One video, multiple time segments

Use this when you're exporting multiple time ranges from the **same source file**.

```ts
import { exportClips } from 'framewebworker';
import type { Segment, ExportOptions } from 'framewebworker';

const segments: Segment[] = [
  { start: 10, end: 25 },
  { start: 42, end: 58 },
  { start: 90, end: 110 },
];

const { blob, metrics } = await exportClips(
  'https://example.com/interview.mp4',
  segments,
  {
    width: 1280,
    height: 720,
    fps: 30,
    onProgress: ({ overall, clips }) => {
      console.log(`Overall: ${Math.round(overall * 100)}%`);
      clips.forEach(c => console.log(`  segment ${c.index}: ${c.status}`));
    },
    onComplete: (m) => {
      console.log(`Done in ${m.totalMs.toFixed(0)}ms — ${m.framesPerSecond.toFixed(1)} fps`);
    },
  }
);

const url = URL.createObjectURL(blob);
```

### With per-segment captions

Caption timestamps are absolute (matching the source video timeline):

```ts
import { exportClips } from 'framewebworker';
import type { Segment } from 'framewebworker';

const segments: Segment[] = [
  {
    start: 0,
    end: 8,
    captions: [
      { text: 'Welcome back', startTime: 0, endTime: 3 },
      { text: 'Today we cover...', startTime: 3, endTime: 8 },
    ],
  },
  {
    start: 45,
    end: 60,
    captions: [
      { text: 'The key insight', startTime: 45, endTime: 52 },
    ],
  },
];

const { blob } = await exportClips('https://example.com/video.mp4', segments, {
  width: 1080,
  height: 1920, // 9:16 portrait
});
```

### `exportClipsToUrl()`

Convenience wrapper that returns an object URL directly:

```ts
import { exportClipsToUrl } from 'framewebworker';

const { url, metrics } = await exportClipsToUrl(
  'https://example.com/video.mp4',
  [{ start: 5, end: 30 }]
);

videoElement.src = url;
```

---

## `mergeClips()` — Multiple source videos

Use this when joining clips from **different source files** via a `FrameWorker` instance.

```ts
import { createFrameWorker } from 'framewebworker';
import type { ClipSource } from 'framewebworker';

const fw = createFrameWorker();

const clips: ClipSource[] = [
  { source: fileA, startTime: 0,  endTime: 10 },
  { source: fileB, startTime: 5,  endTime: 20 },
  { source: fileC, startTime: 12, endTime: 25 },
];

const { blob, metrics } = await fw.mergeClips(clips, {
  width: 1920,
  height: 1080,
  onProgress: ({ overall }) => console.log(`${Math.round(overall * 100)}%`),
  onComplete: (m) => console.log(`${m.framesPerSecond.toFixed(1)} fps`),
});
```

### `mergeClipsToUrl()`

```ts
const { url, metrics } = await fw.mergeClipsToUrl(clips, { width: 1280, height: 720 });
videoElement.src = url;
```

---

## React hooks

Import from `framewebworker/react`.

### `useExportClips` — single video, multiple segments

```tsx
import { useExportClips } from 'framewebworker/react';
import type { Segment } from 'framewebworker';

const segments: Segment[] = [
  { start: 10, end: 25 },
  { start: 60, end: 80 },
];

export function HighlightExporter({ videoUrl }: { videoUrl: string }) {
  const { start, cancel, isRendering, progress, metrics, url, error } = useExportClips(
    videoUrl,
    segments,
    { width: 1280, height: 720, fps: 30 }
  );

  return (
    <div>
      <button onClick={start} disabled={isRendering}>
        {isRendering
          ? `Rendering… ${Math.round((progress?.overall ?? 0) * 100)}%`
          : 'Export'}
      </button>
      <button onClick={cancel} disabled={!isRendering}>Cancel</button>

      {metrics && (
        <p>
          Done in {(metrics.totalMs / 1000).toFixed(1)}s —{' '}
          {metrics.framesPerSecond.toFixed(1)} fps
        </p>
      )}
      {error && <p style={{ color: 'red' }}>{error.message}</p>}
      {url && <a href={url} download="highlight.mp4">Download</a>}
    </div>
  );
}
```

`useExportClips` signature:

```ts
function useExportClips(
  videoUrl: string | null,
  segments: Segment[],
  options?: Omit<ExportOptions, 'onProgress' | 'onComplete' | 'signal'>
): {
  start: () => void;
  cancel: () => void;
  isRendering: boolean;
  progress: RichProgress | null;
  metrics: RenderMetrics | null;
  url: string | null;
  error: Error | null;
}
```

Passing `null` as `videoUrl` disables the hook; `start()` is a no-op until it is set.

### `useMergeClips` — multiple source clips

```tsx
import { createFrameWorker } from 'framewebworker';
import { useMergeClips } from 'framewebworker/react';

const fw = createFrameWorker();

export function MergePanel() {
  const { mergeClips, isRendering, progress, metrics, url } = useMergeClips(fw);

  const handleExport = () =>
    mergeClips([
      { source: fileA, startTime: 0, endTime: 10 },
      { source: fileB, startTime: 5, endTime: 20 },
    ]);

  return (
    <div>
      <button onClick={handleExport} disabled={isRendering}>Export</button>
      {progress && <progress value={progress.overall} />}
      {metrics && <p>{metrics.framesPerSecond.toFixed(1)} fps</p>}
      {url && <a href={url} download="output.mp4">Download</a>}
    </div>
  );
}
```

### `usePreviewClip` — single clip via FrameWorker instance

For rendering a single `ClipSource` through a `FrameWorker` instance:

```tsx
import { createFrameWorker } from 'framewebworker';
import { usePreviewClip } from 'framewebworker/react';
import type { ClipSource } from 'framewebworker';

const fw = createFrameWorker();

export function ClipPreview({ file }: { file: File }) {
  const { render, isRendering, progress, url } = usePreviewClip(fw);

  const clip: ClipSource = { source: file, startTime: 0, endTime: 30 };

  return (
    <button onClick={() => render(clip)} disabled={isRendering}>
      {isRendering ? `${Math.round(progress * 100)}%` : 'Preview clip'}
    </button>
  );
}
```

---

## `RenderMetrics` — timing output

Both `exportClips()` and `mergeClips()` resolve with `{ blob, metrics }`. `onComplete` also receives the same object.

```ts
interface RenderMetrics {
  totalMs: number;         // wall-clock time for the entire operation
  extractionMs: number;    // sum of all segment/clip frame-extraction times
  encodingMs: number;      // sum of all segment/clip ffmpeg encoding times
  stitchMs: number;        // time for the final ffmpeg concat pass
  framesPerSecond: number; // total frames / (totalMs / 1000)
  clips: ClipMetrics[];    // one entry per segment or clip
}

interface ClipMetrics {
  clipId: string;          // segment index (as string)
  extractionMs: number;
  encodingMs: number;
  totalMs: number;         // extractionMs + encodingMs
  framesExtracted: number;
}
```

Example output for a three-segment export:

```ts
{
  totalMs: 4820,
  extractionMs: 3100,
  encodingMs: 1600,
  stitchMs: 120,
  framesPerSecond: 94.2,
  clips: [
    { clipId: '0', extractionMs: 980,  encodingMs: 510, totalMs: 1490, framesExtracted: 450 },
    { clipId: '1', extractionMs: 1050, encodingMs: 560, totalMs: 1610, framesExtracted: 480 },
    { clipId: '2', extractionMs: 1070, encodingMs: 530, totalMs: 1600, framesExtracted: 510 },
  ]
}
```

---

## `ExportOptions` / `MergeOptions`

`ExportOptions` is accepted by `exportClips()` / `exportClipsToUrl()` / `useExportClips()`.
`MergeOptions` is accepted by `mergeClips()` / `mergeClipsToUrl()` / `useMergeClips()`.
Both have identical fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `width` | `number` | `1280` | Output width in pixels |
| `height` | `number` | `720` | Output height in pixels |
| `fps` | `number` | `30` | Frames per second |
| `mimeType` | `string` | `'video/mp4'` | Output MIME type |
| `quality` | `number` | `0.92` | Quality 0–1 (non-ffmpeg backends) |
| `encoderOptions` | `Record<string, unknown>` | — | Extra options passed to the backend |
| `signal` | `AbortSignal` | — | Cancellation signal |
| `onProgress` | `(p: RichProgress) => void` | — | Called on every frame batch |
| `onComplete` | `(m: RenderMetrics) => void` | — | Called once when the final blob is ready |
| `backend` | `RendererBackend` | WebCodecs → ffmpeg | Override the encoder backend (`ExportOptions` only) |

`RichProgress` shape:

```ts
interface RichProgress {
  overall: number;       // 0–1 weighted average across all segments/clips
  clips: ClipProgress[];
}

interface ClipProgress {
  index: number;
  status: 'pending' | 'rendering' | 'encoding' | 'done' | 'error';
  progress: number; // 0–1
}
```

---

## Caption Style Presets

| Preset | Description |
|--------|-------------|
| `hormozi` | Chunky Impact font, gold word highlight, black stroke — viral short-form style |
| `modern` | Clean Inter font, semi-transparent pill background |
| `minimal` | Thin sans-serif, text shadow only, no background |
| `bold` | Yellow-on-black, heavy stroke, uppercase — high contrast |

Override any property:

```ts
captions: {
  segments: [...],
  style: {
    preset: 'hormozi',
    fontSize: 80,
    color: '#00FF00',
  },
}
```

---

## `createFrameWorker` API reference

```ts
import { createFrameWorker } from 'framewebworker';

const fw = createFrameWorker({
  backend: myBackend, // optional, defaults to WebCodecsBackend with ffmpeg fallback
  fps: 30,
  width: 1280,
  height: 720,
});
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `mergeClips` | `(clips[], opts?) => Promise<{ blob, metrics }>` | Merge multiple `ClipSource`s |
| `mergeClipsToUrl` | `(clips[], opts?) => Promise<{ url, metrics }>` | Merge + create object URL |
| `render` | `(clip, opts?) => Promise<Blob>` | Render a single `ClipSource` (preview use) |
| `renderToUrl` | `(clip, opts?) => Promise<string>` | Render + create object URL |

### `ClipSource`

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string \| File \| Blob \| HTMLVideoElement` | Video source |
| `startTime` | `number` | Trim start (seconds, default: 0) |
| `endTime` | `number` | Trim end (seconds, default: duration) |
| `captions` | `CaptionOptions` | Caption segments + style |
| `crop` | `CropOptions` | Crop region (0–1 fractions) |
| `aspectRatio` | `AspectRatio` | `'16:9' \| '9:16' \| '1:1' \| '4:3' \| '3:4' \| 'original'` |
| `volume` | `number` | Volume multiplier 0–2 |

### `Segment`

| Field | Type | Description |
|-------|------|-------------|
| `start` | `number` | Start time in seconds (absolute, within the source video) |
| `end` | `number` | End time in seconds |
| `captions` | `CaptionSegment[]` | Captions to overlay (timestamps are absolute) |

---

## BYOB: Bring Your Own Backend

```ts
import type { RendererBackend, FrameData, EncodeOptions } from 'framewebworker';

const myBackend: RendererBackend = {
  name: 'my-encoder',
  async init() { /* load WASM, warm up workers, etc. */ },
  async encode(frames: FrameData[], opts: EncodeOptions): Promise<Blob> {
    // frames[].imageData (ImageData), .timestamp, .width, .height
  },
  async concat(blobs: Blob[], opts: EncodeOptions): Promise<Blob> { /* ... */ },
};

const fw = createFrameWorker({ backend: myBackend });
```

---

## Migration from v0.2

### Default backend changed

`exportClips()` and `createFrameWorker()` now use **WebCodecsBackend** by default instead of FFmpegBackend. This is transparent for most users — the API is unchanged. If you need to opt back to ffmpeg.wasm explicitly:

```ts
import { exportClips, FFmpegBackend } from 'framewebworker';

const { blob } = await exportClips(videoUrl, segments, {
  backend: new FFmpegBackend(),
});
```

### `isWebCodecsSupported()` helper

```ts
import { isWebCodecsSupported } from 'framewebworker';

if (!isWebCodecsSupported()) {
  console.warn('WebCodecs unavailable — ffmpeg.wasm fallback will be used');
}
```

### Install change

`mp4-muxer` is now a direct dependency (bundled). `@ffmpeg/ffmpeg` is no longer needed for Chrome/Edge users but remains an optional peer dep for the ffmpeg fallback.

---

## Migration from v0.1

| v0.1 | v0.2 | Notes |
|------|------|-------|
| `render(videoUrl, segments)` | `exportClips(videoUrl, segments)` | Deprecated alias kept |
| `renderToUrl(videoUrl, segments)` | `exportClipsToUrl(videoUrl, segments)` | Deprecated alias kept |
| `fw.stitch(clips)` | `fw.mergeClips(clips)` | Deprecated alias kept on FrameWorker |
| `fw.stitchToUrl(clips)` | `fw.mergeClipsToUrl(clips)` | Deprecated alias kept on FrameWorker |
| `useRender(videoUrl, segments)` | `useExportClips(videoUrl, segments)` | Deprecated alias kept |
| `useStitch(fw)` | `useMergeClips(fw)` | Deprecated alias kept |
| `useClipRender(fw)` | `usePreviewClip(fw)` | Deprecated alias kept |
| `StitchOptions` | `MergeOptions` | Deprecated type alias kept |
| `SingleVideoRenderOptions` | `ExportOptions` | Deprecated type alias kept |
| `ClipInput` | `ClipSource` | Deprecated type alias kept |

All v0.1 names emit a `@deprecated` JSDoc warning in editors but continue to work. They will be removed in a future major version.

---

## Browser Requirements

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| WebCodecs (default encoder) | 94+ | ✗ (uses ffmpeg fallback) | 16.4+ |
| OffscreenCanvas (parallel extraction) | 94+ | 105+ | 16.4+ |
| ffmpeg.wasm fallback | ✓ | ✓ | ✓ |

**COOP/COEP headers are only required when ffmpeg.wasm is active** (Firefox, or when you explicitly pass `FFmpegBackend`):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

On Chrome/Edge with the default WebCodecs path, no special headers are needed.

Browsers without `OffscreenCanvas` or `Worker` support fall back to sequential single-threaded frame extraction automatically.

---

## License

MIT © nareshipme
