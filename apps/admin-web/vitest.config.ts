import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Pure-logic tests only (queue → tile mapping, URL status parsing). No DOM.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  // React 19 automatic JSX runtime (as Next compiles it), so pure components
  // can be server-rendered in tests (react-dom/server) without a DOM.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
