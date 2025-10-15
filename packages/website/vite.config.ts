import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@flowtomic/flowgraph': path.resolve(__dirname, '../../src'),
      '@flowtomic/flowgraph-core-view': path.resolve(__dirname, '../core-view/src'),
      '@flowtomic/flowgraph-react': path.resolve(__dirname, '../react/src'),
    },
  },
  server: {
    port: 5180,
  },
});