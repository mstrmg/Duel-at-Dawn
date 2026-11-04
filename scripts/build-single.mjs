// Bundles the game into one self-contained HTML file (dist/duel-at-dawn.html):
// no dev server or npm needed to play it, and it can be published as an artifact.
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

await build({ logLevel: 'warn' });
const assets = readdirSync('dist/assets');
const js = readFileSync(`dist/assets/${assets.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync('style.css', 'utf8');
const body = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*?)<script/)[1].trim();

const html = `<title>Duel at Dawn</title>
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
writeFileSync('dist/duel-at-dawn.html', html);
console.log(`dist/duel-at-dawn.html ${(html.length / 1024).toFixed(0)} KB`);
