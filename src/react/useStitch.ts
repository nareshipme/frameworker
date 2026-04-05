'use client';

import { useState, useCallback, useRef } from 'react';
import type { ClipInput, StitchOptions, RichProgress, RenderMetrics, FrameWorker } from '../types.js';

export interface UseStitchState {
  progress: RichProgress;
  isRendering: boolean;
  error: Error | null;
  blob: Blob | null;
  url: string | null;
  metrics: RenderMetrics | null;
}

export interface UseStitchActions {
  stitch: (clips: ClipInput[], options?: Omit<StitchOptions, 'onProgress' | 'onComplete' | 'signal'>) => Promise<Blob | null>;
  cancel: () => void;
  reset: () => void;
}

export type UseStitchResult = UseStitchState & UseStitchActions;

const INITIAL_PROGRESS: RichProgress = { overall: 0, clips: [] };

export function useStitch(frameWorker: FrameWorker): UseStitchResult {
  const [state, setState] = useState<UseStitchState>({
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

  const stitch = useCallback(
    async (
      clips: ClipInput[],
      options?: Omit<StitchOptions, 'onProgress' | 'onComplete' | 'signal'>
    ): Promise<Blob | null> => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setState({ progress: INITIAL_PROGRESS, isRendering: true, error: null, blob: null, url: null, metrics: null });

      try {
        const { blob, metrics } = await frameWorker.stitch(clips, {
          ...options,
          signal: controller.signal,
          onProgress: (p) => {
            setState((prev) => ({ ...prev, progress: p }));
          },
          onComplete: (m) => {
            setState((prev) => ({ ...prev, metrics: m }));
          },
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

  return { ...state, stitch, cancel, reset };
}
