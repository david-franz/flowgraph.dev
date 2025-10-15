import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const resolveModule = (id: string): string => require.resolve(id);

export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(__dirname, '../../public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@flowtomic/flowgraph': path.resolve(__dirname, '../../src'),
      '@flowtomic/flowgraph-core-view': path.resolve(__dirname, '../core-view/src'),
      '@flowtomic/flowgraph-react': path.resolve(__dirname, '../react/src'),
      'd3-selection': resolveModule('d3-selection'),
      'd3-zoom': resolveModule('d3-zoom'),
    },
  },
  server: {
    port: 5180,
  },
});