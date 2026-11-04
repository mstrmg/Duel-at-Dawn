import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base './' so the built game runs from any static host (or GitHub Pages subpath)
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        blade: resolve(import.meta.dirname, 'blade.html'),
      },
    },
  },
});
