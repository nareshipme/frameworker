export interface CaptionSegment {
  text: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  style?: Partial<CaptionStyle>;
}

export type CaptionStylePreset = 'hormozi' | 'modern' | 'minimal' | 'bold';

export interface CaptionStyle {
  preset: CaptionStylePreset;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  backgroundColor: string;
  backgroundPadding: number;
  backgroundRadius: number;
  position: 'top' | 'center' | 'bottom';
  textAlign: CanvasTextAlign;
  lineHeight: number;
  maxWidth: number; // fraction of video width, 0-1
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  uppercase: boolean;
  wordHighlight: boolean;
  wordHighlightColor: string;
  wordHighlightTextColor: string;
}

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | 'original';

export interface CropOptions {
  x: number; // 0-1
  y: number; // 0-1
  width: number; // 0-1
  height: number; // 0-1
}

export interface CaptionOptions {
  segments: CaptionSegment[];
  style?: Partial<CaptionStyle>;
}

export interface ClipInput {
  /** Video source: URL string, File, Blob, or HTMLVideoElement */
  source: string | File | Blob | HTMLVideoElement;
  /** Trim start in seconds (default: 0) */
  startTime?: number;
  /** Trim end in seconds (default: video duration) */
  endTime?: number;
  /** Captions to overlay */
  captions?: CaptionOptions;
  /** Crop settings */
  crop?: CropOptions;
  /** Output aspect ratio */
  aspectRatio?: AspectRatio;
  /** Volume multiplier 0-2 (default: 1) */
  volume?: number;
}

export interface RenderOptions {
  /** Output width in pixels (default: 1280) */
  width?: number;
  /** Output height in pixels (default: 720) */
  height?: number;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Output MIME type (default: 'video/mp4') */
  mimeType?: string;
  /** Quality 0-1 for non-ffmpeg backends (default: 0.92) */
  quality?: number;
  /** Additional codec/format options passed to the backend */
  encoderOptions?: Record<string, unknown>;
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
  /** AbortSignal to cancel rendering */
  signal?: AbortSignal;
}

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  mimeType: string;
  quality: number;
  encoderOptions?: Record<string, unknown>;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export interface FrameData {
  imageData: ImageData;
  timestamp: number; // seconds
  width: number;
  height: number;
}

/** Pluggable renderer backend interface */
export interface RendererBackend {
  /** Human-readable backend name */
  name: string;
  /** Initialize the backend (load WASM, etc.) */
  init(): Promise<void>;
  /** Encode an array of frames into a video Blob */
  encode(frames: FrameData[], options: EncodeOptions): Promise<Blob>;
  /** Concatenate multiple video Blobs */
  concat(blobs: Blob[], options: EncodeOptions): Promise<Blob>;
  /** Optional cleanup */
  destroy?(): Promise<void>;
}

export interface FrameWorkerConfig {
  /** Renderer backend (default: ffmpeg.wasm) */
  backend?: RendererBackend;
  /** Default FPS (default: 30) */
  fps?: number;
  /** Default output width */
  width?: number;
  /** Default output height */
  height?: number;
}

export interface ClipMetrics {
  clipId: string;
  extractionMs: number;   // worker frame extraction phase
  encodingMs: number;     // ffmpeg encoding phase
  totalMs: number;        // extractionMs + encodingMs
  framesExtracted: number;
}

export interface RenderMetrics {
  totalMs: number;           // wall-clock: stitch() call → final blob
  extractionMs: number;      // sum of all clip extraction times
  encodingMs: number;        // sum of all clip encoding times
  stitchMs: number;          // final ffmpeg concat phase
  clips: ClipMetrics[];
  framesPerSecond: number;   // total frames / (totalMs / 1000)
}

export type ClipStatus = 'pending' | 'rendering' | 'encoding' | 'done' | 'error';

export interface ClipProgress {
  index: number;
  status: ClipStatus;
  progress: number; // 0-1
}

export interface RichProgress {
  overall: number; // 0-1, weighted average across all clips
  clips: ClipProgress[];
}

/** Extends RenderOptions with rich per-clip progress reporting and completion metrics */
export interface StitchOptions extends Omit<RenderOptions, 'onProgress'> {
  onProgress?: (progress: RichProgress) => void;
  onComplete?: (metrics: RenderMetrics) => void;
}

export interface FrameWorker {
  /** Render a single clip to a Blob */
  render(clip: ClipInput, options?: RenderOptions): Promise<Blob>;
  /** Render a single clip and return an object URL */
  renderToUrl(clip: ClipInput, options?: RenderOptions): Promise<string>;
  /** Stitch multiple clips into one Blob */
  stitch(clips: ClipInput[], options?: StitchOptions): Promise<{ blob: Blob; metrics: RenderMetrics }>;
  /** Stitch multiple clips and return an object URL */
  stitchToUrl(clips: ClipInput[], options?: StitchOptions): Promise<{ url: string; metrics: RenderMetrics }>;
}
