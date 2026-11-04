// Bundles a page of the game into one self-contained HTML file, so it can be played
// without a dev server and published as an artifact.
//   node scripts/build-single.mjs            -> dist/duel-at-dawn.html   (the game)
//   node scripts/build-single.mjs blade      -> dist/blade-sandbox.html  (blade prototype)
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const PAGES = {
  main: { html: 'index.html', css: ['style.css'], out: 'dist/duel-at-dawn.html' },
  blade: { html: 'blade.html', css: ['style.css', 'blade.css'], out: 'dist/blade-sandbox.html' },
};
const page = PAGES[process.argv[2] || 'main'];
const outDir = `dist/.single-${process.argv[2] || 'main'}`;

await build({
  configFile: false,
  base: './',
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, rollupOptions: { input: page.html } },
});
const assets = readdirSync(`${outDir}/assets`);
const js = assets.filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${outDir}/assets/${f}`, 'utf8')).join('\n')
  .replace(/<\/script/gi, '<\\/script');
const css = page.css.filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
const src = readFileSync(page.html, 'utf8');
const title = src.match(/<title>(.*?)<\/title>/)[1];
const body = src.match(/<body>([\s\S]*?)<script/)[1].trim();

const html = `<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700;800&display=swap">
<style>
${css}
</style>
${body}
<script type="module">
${js}
</script>
`;
writeFileSync(page.out, html);
console.log(`${page.out} ${(html.length / 1024).toFixed(0)} KB`);
