// 建置：web/ → docs/（GitHub Pages 從 main 分支 /docs 目錄服務）
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docs = path.join(root, 'docs');
const buildId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

fs.mkdirSync(docs, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(root, 'web/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  outfile: path.join(docs, 'bundle.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
});

for (const f of ['index.html', 'manifest.webmanifest', 'icon.svg']) {
  fs.copyFileSync(path.join(root, 'web', f), path.join(docs, f));
}
fs.copyFileSync(path.join(root, 'data/sprite-index.bin'), path.join(docs, 'sprite-index.bin'));
const spriteMeta = JSON.parse(fs.readFileSync(path.join(root, 'data/sprite-meta.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'web/sw.js'), 'utf8')
  .replace('__BUILD_ID__', buildId)
  .replace('__BIN_V__', spriteMeta.hash || String(spriteMeta.count));
fs.writeFileSync(path.join(docs, 'sw.js'), sw);
// index.html 加上 bundle 版本參數避免舊快取
const idx = fs.readFileSync(path.join(docs, 'index.html'), 'utf8')
  .replace('src="bundle.js"', `src="bundle.js?v=${buildId}"`);
fs.writeFileSync(path.join(docs, 'index.html'), idx);

const kb = (fs.statSync(path.join(docs, 'bundle.js')).size / 1024).toFixed(0);
console.log(`built docs/ (bundle ${kb}KB, build ${buildId})`);
