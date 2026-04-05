# FrameWorker

**Browser-native video rendering and clip export.** Trim, caption, and export MP4 Blobs entirely in the browser — no server, no upload, no backend.

[![npm](https://img.shields.io/npm/v/framewebworker)](https://www.npmjs.com/package/framewebworker)
[![CI](https://github.com/nareshipme/frameworker/actions/workflows/ci.yml/badge.svg)](https://github.com/nareshipme/frameworker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Trim** any video to a time range
- **Overlay captions** with built-in style presets (`hormozi`, `modern`, `minimal`, `bold`)
- **Stitch** multiple clips into one
- **Pluggable renderer backend** (default: ffmpeg.wasm)
- **Framework-agnostic core** + React hooks (`frameworker/react`)
- **TypeScript-first** with full type exports
- Respects `AbortSignal` for cancellation, reports progress 0–1

## Install

```bash
npm install framewebworker @ffmpeg/ffmpeg @ffmpeg/util
```

> `@ffmpeg/ffmpeg` and `@ffmpeg/util` are optional peer dependencies required only by the default ffmpeg.wasm backend. If you supply your own backend you don't need them.

## Quick Start

```ts
import { createFrameWorker } from 'framewebworker';

const fw = createFrameWorker();

const blob = await fw.render({
  source: 'https://example.com/my-video.mp4',
  startTime: 5,
  endTime: 15,
  captions: {
    segments: [
      { text: 'Hello world', startTime: 0, endTime: 3 },
      { text: 'This is FrameWorker', startTime: 3, endTime: 5 },
    ],
    style: { preset: 'hormozi' },
  },
}, {
  width: 1280,
  height: 720,
  fps: 30,
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});

const url = URL.createObjectURL(blob);
```

## React Example

```tsx
import { createFrameWorker } from 'framewebworker';
import { useRender } from 'framewebworker/react';

const fw = createFrameWorker();

export function ExportButton({ videoFile }: { videoFile: File }) {
  const { render, isRendering, progress, url, error } = useRender(fw);

  const handleExport = async () => {
    await render({
      source: videoFile,
      startTime: 0,
      endTime: 30,
      captions: {
        segments: [{ text: 'My Clip', startTime: 0, endTime: 5 }],
        style: { preset: 'modern' },
      },
    });
  };

  return (
    <div>
      <button onClick={handleExport} disabled={isRendering}>
        {isRendering ? `Exporting… ${Math.round(progress * 100)}%` : 'Export MP4'}
      </button>
      {error && <p style={{ color: 'red' }}>{error.message}</p>}
      {url && <a href={url} download="clip.mp4">Download</a>}
    </div>
  );
}
```

## Stitch Multiple Clips

```ts
const blob = await fw.stitch([
  { source: fileA, startTime: 0, endTime: 10 },
  { source: fileB, startTime: 5, endTime: 20 },
  { source: fileC },
], { width: 1920, height: 1080 });
```

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

## BYOB: Bring Your Own Backend

Implement the `RendererBackend` interface to use any encoder:

```ts
import type { RendererBackend, FrameData, EncodeOptions } from 'framewebworker';

const myBackend: RendererBackend = {
  name: 'my-encoder',
  async init() {
    // load WASM, warm up workers, etc.
  },
  async encode(frames: FrameData[], opts: EncodeOptions): Promise<Blob> {
    // frames is FrameData[] with .imageData (ImageData), .timestamp, .width, .height
    // return a video Blob
  },
  async concat(blobs: Blob[], opts: EncodeOptions): Promise<Blob> {
    // concatenate multiple video Blobs
  },
};

const fw = createFrameWorker({ backend: myBackend });
```

## API Reference

### `createFrameWorker(config?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `backend` | `RendererBackend` | ffmpeg.wasm | Encoder backend |
| `fps` | `number` | `30` | Default frame rate |
| `width` | `number` | `1280` | Default output width |
| `height` | `number` | `720` | Default output height |

Returns a `FrameWorker` object:

| Method | Signature | Description |
|--------|-----------|-------------|
| `render` | `(clip, opts?) => Promise<Blob>` | Render one clip |
| `renderToUrl` | `(clip, opts?) => Promise<string>` | Render + create object URL |
| `stitch` | `(clips[], opts?) => Promise<Blob>` | Render + concat clips |
| `stitchToUrl` | `(clips[], opts?) => Promise<string>` | Stitch + create object URL |

### `ClipInput`

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string \| File \| Blob \| HTMLVideoElement` | Video source |
| `startTime` | `number` | Trim start (seconds, default: 0) |
| `endTime` | `number` | Trim end (seconds, default: duration) |
| `captions` | `CaptionOptions` | Caption segments + style |
| `crop` | `CropOptions` | Crop region (0–1 fractions) |
| `aspectRatio` | `AspectRatio` | `'16:9' \| '9:16' \| '1:1' \| '4:3' \| '3:4' \| 'original'` |
| `volume` | `number` | Volume multiplier 0–2 |

### `RenderOptions`

| Field | Type | Description |
|-------|------|-------------|
| `width` | `number` | Output width in pixels |
| `height` | `number` | Output height in pixels |
| `fps` | `number` | Frames per second |
| `mimeType` | `string` | Output MIME type |
| `quality` | `number` | Quality 0–1 (non-ffmpeg backends) |
| `onProgress` | `(p: number) => void` | Progress callback 0–1 |
| `signal` | `AbortSignal` | Cancellation signal |

### React Hooks (`framewebworker/react`)

#### `useRender(frameWorker)`

```ts
const { progress, isRendering, error, blob, url, render, cancel, reset } = useRender(fw);
```

#### `useStitch(frameWorker)`

```ts
const { progress, isRendering, error, blob, url, stitch, cancel, reset } = useStitch(fw);
```

Both hooks expose:
- `progress` — number 0–1
- `isRendering` — boolean
- `error` — `Error | null`
- `blob` — the output `Blob | null`
- `url` — `string | null` (object URL, auto-revoked on next render)
- `cancel()` — abort the current render
- `reset()` — clear state and revoke URL

## Browser Requirements

- Chrome/Edge 94+ or Firefox 90+ (OffscreenCanvas, WASM)
- COOP/COEP headers required for ffmpeg.wasm SharedArrayBuffer:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```

## License

MIT © nareshipme
