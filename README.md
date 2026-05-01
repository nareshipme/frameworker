# FrameWorker

> Trim, caption, and export video clips entirely in the browser — no server, no WASM, no extra dependencies.

[![npm](https://img.shields.io/npm/v/framewebworker)](https://www.npmjs.com/package/framewebworker)
[![CI](https://github.com/nareshipme/framewebworker/actions/workflows/ci.yml/badge.svg)](https://github.com/nareshipme/framewebworker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

```ts
import { exportClips } from 'framewebworker';

const { blob } = await exportClips('https://example.com/interview.mp4', [
  { start: 10, end: 25 },
  { start: 60, end: 80 },
]);

const url = URL.createObjectURL(blob);
```

## Install

```bash
npm install framewebworker
```

No peer dependencies. Powered by `MediaRecorder` + `canvas.captureStream` — no ffmpeg, no WASM.

## Browser Support

| Browser | Version |
|---------|---------|
| Chrome / Edge | 74+ |
| Firefox | 71+ |
| Safari | 15.4+ |

No special COOP/COEP headers required.

---

## Table of Contents

- [Which API?](#which-api)
- [exportClips](#exportclips--one-video-multiple-segments)
- [mergeClips](#mergeclips--multiple-source-videos)
- [React hooks](#react-hooks)
- [Captions](#captions)
- [API Reference](#api-reference)
- [Migration from v0.4](#migration-from-v04)
- [Contributing](#contributing)

---

## Which API?

| | `exportClips()` | `mergeClips()` |
|---|---|---|
| **Use when** | Exporting segments from one video | Joining clips from different files |
| **Input** | One URL + time ranges | Multiple `ClipSource` objects |
| **React hook** | `useExportClips` | `useMergeClips` |

Both return `{ blob, metrics }`.

---

## `exportClips` — One video, multiple segments

```ts
import { exportClips } from 'framewebworker';

const { blob, metrics } = await exportClips(
  'https://example.com/interview.mp4',
  [
    { start: 10, end: 25 },
    { start: 42, end: 58 },
  ],
  {
    onProgress: ({ overall }) => console.log(`${Math.round(overall * 100)}%`),
    onComplete: (m) => console.log(`Done in ${(m.totalMs / 1000).toFixed(1)}s`),
  }
);
```

Convenience wrapper that returns an object URL directly:

```ts
import { exportClipsToUrl } from 'framewebworker';

const { url } = await exportClipsToUrl(videoUrl, [{ start: 5, end: 30 }]);
videoElement.src = url;
```

---

## `mergeClips` — Multiple source videos

```ts
import { createFrameWorker } from 'framewebworker';

const fw = createFrameWorker();

const { blob } = await fw.mergeClips([
  { source: fileA, startTime: 0,  endTime: 10 },
  { source: fileB, startTime: 5,  endTime: 20 },
], {
  onProgress: ({ overall }) => console.log(`${Math.round(overall * 100)}%`),
});
```

---

## React Hooks

```bash
import { useExportClips, useMergeClips } from 'framewebworker/react';
```

### `useExportClips`

```tsx
const { start, cancel, isRendering, progress, url, error } = useExportClips(
  videoUrl,
  [{ start: 10, end: 25 }, { start: 60, end: 80 }]
);

return (
  <>
    <button onClick={start} disabled={isRendering}>
      {isRendering ? `${Math.round((progress?.overall ?? 0) * 100)}%` : 'Export'}
    </button>
    <button onClick={cancel} disabled={!isRendering}>Cancel</button>
    {error && <p>{error.message}</p>}
    {url && <a href={url} download="clips.webm">Download</a>}
  </>
);
```

### `useMergeClips`

```tsx
const { mergeClips, isRendering, progress, url } = useMergeClips(fw);

return (
  <>
    <button onClick={() => mergeClips([
      { source: fileA, startTime: 0, endTime: 10 },
      { source: fileB, startTime: 5, endTime: 20 },
    ])} disabled={isRendering}>
      Merge
    </button>
    {progress && <progress value={progress.overall} />}
    {url && <a href={url} download="output.webm">Download</a>}
  </>
);
```

---

## Captions

Pass `captions` on any segment or `ClipSource`. Timestamps are relative to the clip's `start`.

```ts
await exportClips(videoUrl, [
  {
    start: 0,
    end: 8,
    captions: [
      { text: 'Welcome back',    startTime: 0, endTime: 3 },
      { text: 'Today we cover…', startTime: 3, endTime: 8 },
    ],
  },
]);
```

Four built-in style presets:

| Preset | Look |
|--------|------|
| `modern` | Clean Inter font, semi-transparent pill background |
| `hormozi` | Chunky Impact, gold word highlight, black stroke |
| `bold` | Yellow-on-black, heavy stroke, uppercase |
| `minimal` | Thin sans-serif, text shadow only |

```ts
captions: {
  segments: [...],
  style: { preset: 'hormozi', fontSize: 80, color: '#00FF00' },
}
```

---

## API Reference

### `ClipSource`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `source` | `string \| File \| Blob \| HTMLVideoElement` | — | Video source |
| `startTime` | `number` | `0` | Trim start (seconds) |
| `endTime` | `number` | duration | Trim end (seconds) |
| `captions` | `CaptionOptions` | — | Overlay captions |
| `crop` | `CropOptions` | — | Crop region (0–1 fractions) |
| `aspectRatio` | `'16:9' \| '9:16' \| '1:1' \| '4:3' \| '3:4' \| 'original'` | `'original'` | Output aspect ratio |
| `volume` | `number` | `1` | Volume multiplier 0–2 |

### `ExportOptions` / `MergeOptions`

| Field | Type | Description |
|-------|------|-------------|
| `signal` | `AbortSignal` | Cancel the render |
| `onProgress` | `(p: RichProgress) => void` | Called per clip with `{ overall: 0–1, clips[] }` |
| `onComplete` | `(m: RenderMetrics) => void` | Called once with final metrics |

### `RenderMetrics`

```ts
interface RenderMetrics {
  totalMs: number;
  extractionMs: number;
  encodingMs: number;      // always 0 — no separate encode step
  stitchMs: number;        // always 0 — blobs concatenated in memory
  framesPerSecond: number;
  clips: ClipMetrics[];
}
```

### `isCanvasRecordingSupported()`

Returns `true` if `MediaRecorder` and `captureStream` are available.

---

## Migration from v0.4

- **Remove** `@ffmpeg/ffmpeg`, `@ffmpeg/util`, `mp4-muxer` from your dependencies
- **Remove** the `backend` option from `exportClips()` / `createFrameWorker()` — no longer supported
- **Replace** `isWebCodecsSupported()` → `isCanvasRecordingSupported()`
- Output is now **WebM** — update any hardcoded `.mp4` extensions or `accept` filters
- `RenderMetrics.encodingMs` and `stitchMs` are always `0`

### Deprecated aliases from v0.1 (still work)

| Old name | New name |
|----------|----------|
| `render()` | `exportClips()` |
| `renderToUrl()` | `exportClipsToUrl()` |
| `fw.stitch()` | `fw.mergeClips()` |
| `fw.stitchToUrl()` | `fw.mergeClipsToUrl()` |
| `useRender()` | `useExportClips()` |
| `useStitch()` | `useMergeClips()` |
| `StitchOptions` | `MergeOptions` |
| `ClipInput` | `ClipSource` |

---

## Contributing

Issues and PRs are welcome. Run the test suite with:

```bash
npm install
npm test
```

---

## License

MIT © nareshipme
