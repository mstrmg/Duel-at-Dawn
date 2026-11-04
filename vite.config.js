import { defineConfig } from 'vite';

// base './' so the built game runs from any static host (or GitHub Pages subpath).
// Two pages: the combat prototype (index.html) and the Spring map explorer (spring.html).
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', spring: 'spring.html' } } },
});
