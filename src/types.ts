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

/** Input descriptor for one clip source used by mergeClips() */
export interface ClipSource {
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

/** @deprecated Use ClipSource */
export type ClipInput = ClipSource;

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

/** @deprecated No longer used — canvas is the only backend */
export interface EncodeOptions {
  width: number; height: number; fps: number; mimeType: string; quality: number;
  encoderOptions?: Record<string, unknown>; onProgress?: (progress: number) => void; signal?: AbortSignal;
}

/** @deprecated No longer used — canvas is the only backend */
export interface FrameData {
  imageData: ImageData; timestamp: number; width: number; height: number;
}

/** @deprecated No longer used — canvas is the only backend */
export interface RendererBackend {
  name: string; init(): Promise<void>; encode(frames: FrameData[], options: EncodeOptions): Promise<Blob>;
  concat(blobs: Blob[], options: EncodeOptions): Promise<Blob>; destroy?(): Promise<void>;
}

export interface FrameWorkerConfig {
  fps?: number; width?: number; height?: number;
}

export interface ClipMetrics {
  clipId: string;
  extractionMs: number;   // worker frame extraction phase
  encodingMs: number;     // ffmpeg encoding phase
  totalMs: number;        // extractionMs + encodingMs
  framesExtracted: number;
}

export interface RenderMetrics {
  totalMs: number;           // wall-clock: mergeClips() / exportClips() call → final blob
  extractionMs: number;      // sum of all clip/segment extraction times
  encodingMs: number;        // sum of all clip/segment encoding times
  stitchMs: number;          // final ffmpeg concat phase
  clips: ClipMetrics[];
  framesPerSecond: number;   // total frames / (totalMs / 1000)
}

/** One time-range segment from a single source video, used by exportClips() */
export interface Segment {
  start: number;          // seconds
  end: number;            // seconds
  captions?: CaptionSegment[];
}

export type ClipStatus = 'pending' | 'rendering' | 'encoding' | 'done' | 'error';

export interface ClipProgress {
  index: number;
  status: ClipStatus;
  progress: number; // 0-1
}

export interface RichProgress {
  overall: number; // 0-1, weighted average across all clips/segments
  clips: ClipProgress[];
}

/** Options for mergeClips() / FrameWorker.mergeClips() */
export interface MergeOptions extends Omit<RenderOptions, 'onProgress'> {
  onProgress?: (progress: RichProgress) => void;
  onComplete?: (metrics: RenderMetrics) => void;
}

/** @deprecated Use MergeOptions */
export type StitchOptions = MergeOptions;

/** Options for exportClips() / exportClipsToUrl() */
export interface ExportOptions extends Omit<MergeOptions, 'onProgress' | 'onComplete'> {
  onProgress?: (progress: RichProgress) => void;
  onComplete?: (metrics: RenderMetrics) => void;
}

/** @deprecated Use ExportOptions */
export type SingleVideoRenderOptions = ExportOptions;

export interface FrameWorker {
  /** Render a single clip to a Blob (legacy single-clip API) */
  render(clip: ClipSource, options?: RenderOptions): Promise<Blob>;
  /** Render a single clip and return an object URL (legacy single-clip API) */
  renderToUrl(clip: ClipSource, options?: RenderOptions): Promise<string>;
  /** Merge multiple clip sources into one Blob */
  mergeClips(clips: ClipSource[], options?: MergeOptions): Promise<{ blob: Blob; metrics: RenderMetrics }>;
  /** Merge multiple clip sources and return an object URL */
  mergeClipsToUrl(clips: ClipSource[], options?: MergeOptions): Promise<{ url: string; metrics: RenderMetrics }>;
  /** @deprecated Use mergeClips() */
  stitch(clips: ClipSource[], options?: MergeOptions): Promise<{ blob: Blob; metrics: RenderMetrics }>;
  /** @deprecated Use mergeClipsToUrl() */
  stitchToUrl(clips: ClipSource[], options?: MergeOptions): Promise<{ url: string; metrics: RenderMetrics }>;
}
