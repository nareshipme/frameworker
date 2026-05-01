import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'], dts: true, sourcemap: true, clean: true,
    splitting: false, treeshake: true, external: ['react', 'react-dom'],
    esbuildOptions(options) { options.conditions = ['browser']; },
  },
  {
    entry: { render: 'src/render.ts' },
    format: ['esm', 'cjs'], dts: false, sourcemap: true,
    splitting: false, treeshake: true, external: ['react', 'react-dom'],
    esbuildOptions(options) { options.conditions = ['browser']; },
  },
  {
    entry: { 'react/index': 'src/react/index.ts' },
    format: ['esm', 'cjs'], dts: true, sourcemap: true,
    splitting: false, treeshake: true, external: ['react', 'react-dom', '..'],
    esbuildOptions(options) { options.conditions = ['browser']; },
  },
]);
