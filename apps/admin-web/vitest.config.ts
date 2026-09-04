import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Pure-logic tests only (queue → tile mapping, URL status parsing). No DOM.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
