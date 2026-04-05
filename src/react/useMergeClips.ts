'use client';

import { useState, useCallback, useRef } from 'react';
import type { ClipSource, MergeOptions, RichProgress, RenderMetrics, FrameWorker } from '../types.js';

export interface UseMergeClipsState {
  progress: RichProgress;
  isRendering: boolean;
  error: Error | null;
  blob: Blob | null;
  url: string | null;
  metrics: RenderMetrics | null;
}

export interface UseMergeClipsActions {
  mergeClips: (clips: ClipSource[], options?: Omit<MergeOptions, 'onProgress' | 'onComplete' | 'signal'>) => Promise<Blob | null>;
  cancel: () => void;
  reset: () => void;
}

export type UseMergeClipsResult = UseMergeClipsState & UseMergeClipsActions;

const INITIAL_PROGRESS: RichProgress = { overall: 0, clips: [] };

export function useMergeClips(frameWorker: FrameWorker): UseMergeClipsResult {
  const [state, setState] = useState<UseMergeClipsState>({
    progress: INITIAL_PROGRESS,
    isRendering: false,
    error: null,
    blob: null,
    url: null,
    metrics: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setState({ progress: INITIAL_PROGRESS, isRendering: false, error: null, blob: null, url: null, metrics: null });
  }, []);

  const mergeClips = useCallback(
    async (
      clips: ClipSource[],
      options?: Omit<MergeOptions, 'onProgress' | 'onComplete' | 'signal'>
    ): Promise<Blob | null> => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setState({ progress: INITIAL_PROGRESS, isRendering: true, error: null, blob: null, url: null, metrics: null });

      try {
        const { blob } = await frameWorker.mergeClips(clips, {
          ...options,
          signal: controller.signal,
          onProgress: (p) => setState((prev) => ({ ...prev, progress: p })),
          onComplete: (m) => setState((prev) => ({ ...prev, metrics: m })),
        });

        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const doneProgress: RichProgress = {
          overall: 1,
          clips: clips.map((_, i) => ({ index: i, status: 'done', progress: 1 })),
        };
        setState((prev) => ({ ...prev, progress: doneProgress, isRendering: false, blob, url }));
        return blob;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setState((prev) => ({ ...prev, isRendering: false, error: null }));
          return null;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, isRendering: false, error }));
        return null;
      }
    },
    [frameWorker]
  );

  return { ...state, mergeClips, cancel, reset };
}
