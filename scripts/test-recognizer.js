// M4.2 POC 驗證：把 sprite 合成到模擬截圖背景上（縮放/偏移/亮度/雜訊/剪影），
// 跑 match-core 檢查正確答案有沒有進 top1/top5。
// 用法：node scripts/test-recognizer.js [樣本數，預設300]
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const cacheDir = path.join(root, '.sprite-cache');
const meta = require(path.join(root, 'data/sprite-meta.json'));
const binBuf = fs.readFileSync(path.join(root, 'data/sprite-index.bin'));

// 決定性偽隨機（每次跑結果一致）
let seed = 20260905;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

// PS 名 → 快取檔名：build-sprite-index 會把每筆實際用的來源寫進 sources.json
const sources = JSON.parse(fs.readFileSync(path.join(cacheDir, 'sources.json'), 'utf8'));

// 合成一張「截圖框選區」：sprite 貼在雜訊/漸層背景上
function synth(png, { boxSize, spriteMax, silhouette }) {
  const data = new Uint8ClampedArray(boxSize * boxSize * 4);
  const bgBase = [30 + rnd() * 180, 30 + rnd() * 180, 30 + rnd() * 180];
  const grad = (rnd() - 0.5) * 60;
  for (let y = 0; y < boxSize; y++) for (let x = 0; x < boxSize; x++) {
    const i = (y * boxSize + x) * 4;
    const g = grad * y / boxSize;
    data[i] = bgBase[0] + g + (rnd() - 0.5) * 10;
    data[i + 1] = bgBase[1] + g + (rnd() - 0.5) * 10;
    data[i + 2] = bgBase[2] + g + (rnd() - 0.5) * 10;
    data[i + 3] = 255;
  }
  // sprite 透明外框裁掉再貼
  const { width: w, height: h, data: sp } = png;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (sp[(y * w + x) * 4 + 3] >= 32) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const scale = spriteMax / Math.max(bw, bh);
  const ow = Math.round(bw * scale), oh = Math.round(bh * scale);
  const offX = Math.round((boxSize - ow) / 2 + (rnd() - 0.5) * 0.3 * boxSize);
  const offY = Math.round((boxSize - oh) / 2 + (rnd() - 0.5) * 0.3 * boxSize);
  const bright = 0.85 + rnd() * 0.3;
  const silColor = [30 + rnd() * 40, 30 + rnd() * 40, 45 + rnd() * 40];
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    const dx = offX + ox, dy = offY + oy;
    if (dx < 0 || dy < 0 || dx >= boxSize || dy >= boxSize) continue;
    const sx = x0 + Math.min(bw - 1, Math.floor(ox / scale));
    const sy = y0 + Math.min(bh - 1, Math.floor(oy / scale));
    const si = (sy * w + sx) * 4;
    const a = sp[si + 3] / 255;
    if (a < 0.3) continue;
    const i = (dy * boxSize + dx) * 4;
    const px = silhouette ? silColor : [sp[si] * bright, sp[si + 1] * bright, sp[si + 2] * bright];
    data[i] = px[0] * a + data[i] * (1 - a) + (rnd() - 0.5) * 12;
    data[i + 1] = px[1] * a + data[i + 1] * (1 - a) + (rnd() - 0.5) * 12;
    data[i + 2] = px[2] * a + data[i + 2] * (1 - a) + (rnd() - 0.5) * 12;
  }
  return { width: boxSize, height: boxSize, data };
}

(async () => {
  const { parseLib, cropToDescriptor, match, BYTES_PER } =
    await import('../web/match-core.js');
  const lib = parseLib(binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.length), meta.count);

  // 同圖群組：fallback 形態共用同一張 sprite，比對到同群任何一筆都算對
  const groupOf = new Map();
  const byBytes = new Map();
  for (let i = 0; i < meta.count; i++) {
    const key = Buffer.from(binBuf.buffer, binBuf.byteOffset + i * BYTES_PER, BYTES_PER).toString('base64');
    if (!byBytes.has(key)) byBytes.set(key, []);
    byBytes.get(key).push(i);
  }
  for (const g of byBytes.values()) for (const i of g) groupOf.set(i, g);

  const nSample = +process.argv[2] || 300;
  const picks = [];
  const used = new Set();
  while (picks.length < Math.min(nSample, meta.count)) {
    const i = Math.floor(rnd() * meta.count);
    if (!used.has(i)) { used.add(i); picks.push(i); }
  }

  for (const mode of ['彩色', '剪影']) {
    let top1 = 0, top5 = 0, fail = 0, n = 0;
    const misses = [];
    for (const idx of picks) {
      const file = path.join(cacheDir, (sources[meta.names[idx]] || '') + '.png');
      if (!fs.existsSync(file)) continue;
      const png = PNG.sync.read(fs.readFileSync(file));
      const spriteMax = [28, 44, 64][Math.floor(rnd() * 3)];
      const img = synth(png, {
        boxSize: Math.round(spriteMax * (1.2 + rnd() * 0.5)),
        spriteMax, silhouette: mode === '剪影',
      });
      const desc = cropToDescriptor(img, null);
      n++;
      if (!desc) { fail++; misses.push(meta.names[idx] + '(無前景)'); continue; }
      const res = match(desc, lib, 5);
      const grp = new Set(groupOf.get(idx));
      if (grp.has(res[0].i)) top1++;
      if (res.some(r => grp.has(r.i))) top5++;
      else misses.push(`${meta.names[idx]}→${res.slice(0, 3).map(r => meta.names[r.i]).join('/')}`);
    }
    console.log(`【${mode}】n=${n}  top1=${(top1 / n * 100).toFixed(1)}%  top5=${(top5 / n * 100).toFixed(1)}%  無前景=${fail}`);
    if (misses.length) console.log('  未中(前10):', misses.slice(0, 10).join(' | '));
  }
})();
