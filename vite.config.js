import { defineConfig } from 'vite';

// base './' so the built game runs from any static host (or GitHub Pages subpath).
// Three pages: the combat prototype (index.html) and the Spring and Summer maps.
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', spring: 'spring.html', summer: 'summer.html' } } },
});
