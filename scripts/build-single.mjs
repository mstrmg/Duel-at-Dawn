// Bundles each page into one self-contained HTML file: no dev server or npm needed to
// play it, and it can be published as an artifact.
//   dist/duel-at-dawn.html  the combat prototype (index.html)
//   dist/spring-map.html    the Spring map explorer (spring.html)
//   dist/summer-map.html    the Summer map explorer (summer.html)
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const PAGES = [
  { html: 'index.html', out: 'duel-at-dawn.html', title: 'Duel at Dawn', css: ['style.css'] },
  { html: 'spring.html', out: 'spring-map.html', title: 'Duel at Dawn: Spring', css: ['style.css', 'spring.css'] },
  { html: 'summer.html', out: 'summer-map.html', title: 'Duel at Dawn: Summer', css: ['style.css', 'spring.css', 'summer.css'] },
];
const only = process.argv[2];

mkdirSync('dist', { recursive: true });
for (const page of PAGES) {
  if (only && !page.out.startsWith(only)) continue;
  const outDir = `dist/.single-${page.out}`;
  await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true, rollupOptions: { input: page.html } } });
  const assets = readdirSync(`${outDir}/assets`);
  const js = readFileSync(`${outDir}/assets/${assets.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
  const css = page.css.map((f) => readFileSync(f, 'utf8')).join('\n');
  const body = readFileSync(page.html, 'utf8').match(/<body>([\s\S]*?)<script/)[1].trim();
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700;800&display=swap">
<style>
${css}
</style>
</head>
<body>
${body}
<script type="module">
${js}
</script>
</body>
</html>
`;
  writeFileSync(`dist/${page.out}`, html);
  console.log(`dist/${page.out} ${(html.length / 1024).toFixed(0)} KB`);
}
