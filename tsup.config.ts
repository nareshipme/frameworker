import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'mp4-muxer', 'react', 'react-dom'],
    esbuildOptions(options) {
      options.conditions = ['browser'];
    },
  },
  {
    // render.ts as a standalone entry so dist/render.js exists for the react bundle to import.
    // No DTS here — all public types are declared through the main index entry above.
    entry: {
      render: 'src/render.ts',
    },
    format: ['esm', 'cjs'],
    dts: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'mp4-muxer', 'react', 'react-dom'],
    esbuildOptions(options) {
      options.conditions = ['browser'];
    },
  },
  {
    entry: {
      'react/index': 'src/react/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'react', 'react-dom', '..'],
    esbuildOptions(options) {
      options.conditions = ['browser'];
    },
  },
  {
    // Self-contained worker bundle — all deps inlined, no externals
    entry: {
      'worker/render-worker': 'src/worker/render-worker.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: false,
    splitting: false,
    treeshake: true,
    platform: 'browser',
    // No external[] — captions.ts and its deps must be bundled in
  },
]);
