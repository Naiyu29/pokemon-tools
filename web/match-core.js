// M4.2 端上辨識核心：截圖框選區 → 16×16 描述子 → 與 sprite 庫比對
// 純計算、無 DOM 依賴，瀏覽器與 node 測試腳本共用
export const SIZE = 16;
const PX = SIZE * SIZE;            // 256
const MASK_BYTES = PX / 8;         // 32
export const BYTES_PER = PX * 3 + MASK_BYTES; // 800

const POP = new Uint8Array(256);
for (let i = 0; i < 256; i++) POP[i] = (i & 1) + POP[i >> 1];

// sprite-index.bin → [{rgb:Uint8Array(768), mask:Uint8Array(32)}]
export function parseLib(arrayBuffer, count) {
  const buf = new Uint8Array(arrayBuffer);
  const lib = [];
  for (let i = 0; i < count; i++) {
    const off = i * BYTES_PER;
    lib.push({
      rgb: buf.subarray(off, off + PX * 3),
      mask: buf.subarray(off + PX * 3, off + BYTES_PER),
    });
  }
  return lib;
}

const bit = (mask, p) => (mask[p >> 3] >> (p & 7)) & 1;

// 框選區 RGBA → 描述子。流程：邊框估背景色 → 前景遮罩 → 取遮罩外框 →
// 等比例縮到 16×16（置中）。回傳 null 表示框裡找不到前景。
// img: {width, height, data(Uint8ClampedArray RGBA)}；box: {x,y,w,h}（可省略＝整張）
export function cropToDescriptor(img, box) {
  const bx = box ? Math.max(0, box.x | 0) : 0;
  const by = box ? Math.max(0, box.y | 0) : 0;
  const bw = box ? Math.min(img.width - bx, box.w | 0) : img.width;
  const bh = box ? Math.min(img.height - by, box.h | 0) : img.height;
  if (bw < 8 || bh < 8) return null;
  const at = (x, y) => {
    const i = ((by + y) * img.width + bx + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  // 背景色：邊框像素每通道中位數
  const border = [];
  for (let x = 0; x < bw; x++) border.push(at(x, 0), at(x, bh - 1));
  for (let y = 1; y < bh - 1; y++) border.push(at(0, y), at(bw - 1, y));
  const med = ch => {
    const v = border.map(p => p[ch]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const bg = [med(0), med(1), med(2)];
  const dist = p => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
  // 門檻：依邊框離散度微調，但設上限——雷射掃過邊框時不能讓門檻暴衝
  // （門檻一高，深色身體會整片被當成背景）
  const bd = border.map(dist).sort((a, b) => a - b);
  const thr = Math.min(85, Math.max(38, bd[bd.length >> 1] * 1.5 + 12));

  const raw = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (dist(at(x, y)) > thr) raw[y * bw + x] = 1;
  }
  // 形態學開運算（侵蝕→膨脹）：斜切過卡片的雷射是細線，開運算會整條消掉；
  // 本體夠粗，侵蝕後再膨脹回原形
  const R = Math.max(1, Math.round(Math.min(bw, bh) / 60) + 1);
  const ero = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (!raw[y * bw + x]) continue;
    let solid = true;
    for (let dy = -R; solid && dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || xx < 0 || yy >= bh || xx >= bw || !raw[yy * bw + xx]) { solid = false; break; }
    }
    if (solid) ero[y * bw + x] = 1;
  }
  let fg = new Uint8Array(bw * bh);
  let fgCount = 0;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    let on = false;
    for (let dy = -R; !on && dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && xx >= 0 && yy < bh && xx < bw && ero[yy * bw + xx]) { on = true; break; }
    }
    // 膨脹只找回原本就是前景的像素（開運算），不會把背景吃進來
    if (on && raw[y * bw + x]) { fg[y * bw + x] = 1; fgCount++; }
  }
  if (fgCount < 36) { fg = raw; } // 前景太小（開運算殺過頭）→ 退回原遮罩
  // 連通元件分析：卡片上常有煙霧特效、徽章浮水印等大塊雜訊，跟本體不相連。
  // 取最大元件，並把「不小於最大元件 55%」的元件一併保留（Maushold 一家、
  // 展翅火蛾這類本來就分成多塊的 sprite），其餘丟掉。
  const compId = new Int32Array(bw * bh).fill(-1);
  const compSize = [];
  const stack = [];
  for (let p0 = 0; p0 < bw * bh; p0++) {
    if (!fg[p0] || compId[p0] >= 0) continue;
    const id = compSize.length;
    let size = 0;
    stack.push(p0); compId[p0] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const px = p % bw, py = (p / bw) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = px + dx, yy = py + dy;
        if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
        const q = yy * bw + xx;
        if (fg[q] && compId[q] < 0) { compId[q] = id; stack.push(q); }
      }
    }
    compSize.push(size);
  }
  if (!compSize.length) return null;
  const maxSize = Math.max(...compSize);
  const keep = compSize.map(s => s >= maxSize * 0.55);
  let x0 = bw, y0 = bh, x1 = -1, y1 = -1;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const p = y * bw + x;
    if (!fg[p]) continue;
    if (!keep[compId[p]]) { fg[p] = 0; continue; }
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0 || (x1 - x0 + 1) * (y1 - y0 + 1) < 36) return null;

  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const scale = SIZE / Math.max(cw, ch);
  const ow = Math.max(1, Math.round(cw * scale)), oh = Math.max(1, Math.round(ch * scale));
  const offX = (SIZE - ow) >> 1, offY = (SIZE - oh) >> 1;
  const rgb = new Uint8Array(PX * 3);
  const mask = new Uint8Array(MASK_BYTES);
  let sr = 0, sg = 0, sb = 0, sn = 0, sq = 0;
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    const sx0 = x0 + Math.floor(ox / scale), sx1 = Math.min(x1, x0 + Math.ceil((ox + 1) / scale) - 1);
    const sy0 = y0 + Math.floor(oy / scale), sy1 = Math.min(y1, y0 + Math.ceil((oy + 1) / scale) - 1);
    let r = 0, g = 0, b = 0, n = 0, tot = 0;
    for (let sy = sy0; sy <= sy1; sy++) for (let sx = sx0; sx <= sx1; sx++) {
      tot++;
      if (!fg[sy * bw + sx]) continue;
      const p = at(sx, sy);
      r += p[0]; g += p[1]; b += p[2]; n++;
    }
    if (n / tot > 0.35) {
      const px = (offY + oy) * SIZE + (offX + ox);
      rgb[px * 3] = r / n; rgb[px * 3 + 1] = g / n; rgb[px * 3 + 2] = b / n;
      mask[px >> 3] |= 1 << (px & 7);
      const lum = (r + g + b) / (3 * n);
      sr += r / n; sg += g / n; sb += b / n; sn++; sq += lum * lum;
    }
  }
  if (!sn) return null;
  // 剪影判定：前景亮度變異極小才算（真實選角截圖是全彩，門檻放很低避免誤判）
  const meanLum = (sr + sg + sb) / (3 * sn);
  const lumSd = Math.sqrt(Math.max(0, sq / sn - meanLum * meanLum));
  return { rgb, mask, silhouette: lumSd < 8 };
}

function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < MASK_BYTES; i++) {
    inter += POP[a[i] & b[i]];
    uni += POP[a[i] | b[i]];
  }
  return uni ? inter / uni : 0;
}

// ---- 評分（2026-09-05 用真實截圖調校）----
// 主力是「調色盤直方圖」：fg 像素 RGB 各取高 3 bit（512 bins）做 histogram
// intersection——完全不受對位/縮放影響，對截圖的裁切誤差最強韌。
// 輔以 4×4 區塊平均色（粗空間佈局）當 tiebreaker。
// （試過前景亮度正規化，真實截圖驗證反而更差，維持不校正）
function histOf(d) {
  if (d._hist) return d._hist;
  const h = new Float32Array(512);
  let n = 0;
  for (let p = 0; p < PX; p++) {
    if (!bit(d.mask, p)) continue;
    h[((d.rgb[p * 3] >> 5) << 6) | ((d.rgb[p * 3 + 1] >> 5) << 3) | (d.rgb[p * 3 + 2] >> 5)]++;
    n++;
  }
  if (n) for (let i = 0; i < 512; i++) h[i] /= n;
  d._hist = h;
  return h;
}
function histSim(a, b) {
  let s = 0;
  for (let i = 0; i < 512; i++) if (a[i] && b[i]) s += Math.min(a[i], b[i]);
  return s;
}
function blocksOf(d) {
  if (d._blk) return d._blk;
  const out = [];
  for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = by * 4; y < by * 4 + 4; y++) for (let x = bx * 4; x < bx * 4 + 4; x++) {
      const p = y * SIZE + x;
      if (!bit(d.mask, p)) continue;
      r += d.rgb[p * 3]; g += d.rgb[p * 3 + 1]; b += d.rgb[p * 3 + 2]; n++;
    }
    out.push(n >= 3 ? [r / n, g / n, b / n] : null);
  }
  d._blk = out;
  return out;
}
function blockSim(a, b) {
  let pen = 0, n = 0;
  for (let i = 0; i < 16; i++) {
    if (!a[i] && !b[i]) continue;
    n++;
    if (a[i] && b[i]) {
      pen += (Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) + Math.abs(a[i][2] - b[i][2])) / 765;
    } else pen += 0.6;
  }
  return n ? 1 - pen / n : 0;
}

// 自動偵測選角/準備畫面右側的 6 張對手卡（深紅色卡片），回傳各卡 sprite 區塊
// 實測卡片底色約 rgb(135,5,50)；回傳 [{x,y,w,h}]（sprite 在卡片左側約 45%）
export function detectFoeCards(img) {
  const { width: w, height: h, data } = img;
  const step = Math.max(1, Math.round(w / 600)); // 降解析度掃描
  const xStart = Math.floor(w * 0.5);
  // 卡片深紅的特徵：綠色極低（實測 g≈3~10）、藍約為紅的 0.2~0.6 倍。
  // 條件收緊以排除雷射（粉紅，g 高）與火焰（橘，g 高）
  const isCard = i => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return r > 85 && r < 215 && g < r * 0.3 && b > r * 0.15 && b < r * 0.65;
  };
  // 每列數卡片色像素
  const rows = new Int32Array(Math.ceil(h / step));
  for (let y = 0; y < h; y += step) {
    let n = 0;
    for (let x = xStart; x < w; x += step) if (isCard((y * w + x) * 4)) n++;
    rows[y / step | 0] = n;
  }
  const rowMax = Math.max(...rows);
  if (rowMax < 10) return [];
  const thr = rowMax * 0.25;
  // 連續列群組成卡片帶；卡片間隙實測僅 ~12px，超過 1 列空隙就切斷
  const bands = [];
  let s = -1, gap = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] > thr) { if (s < 0) s = i; gap = 0; }
    else if (s >= 0 && ++gap > 1) { bands.push([s, i - gap]); s = -1; }
  }
  if (s >= 0) bands.push([s, rows.length - 1]);
  const minH = (h / step) * 0.04;
  let good = bands.filter(b => b[1] - b[0] >= minH);
  if (good.length > 6) good = good.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 6)
    .sort((a, b) => a[0] - b[0]);
  // 各帶取卡片色像素的 x 範圍（5%~95% 百分位避開雜點）
  const boxes = [];
  for (const [r0, r1] of good) {
    const xs = [];
    for (let yi = r0; yi <= r1; yi++) {
      const y = yi * step;
      for (let x = xStart; x < w; x += step) if (isCard((y * w + x) * 4)) xs.push(x);
    }
    if (xs.length < 30) continue;
    xs.sort((a, b) => a - b);
    const x0 = xs[Math.floor(xs.length * 0.05)], x1 = xs[Math.floor(xs.length * 0.95)];
    const y0 = r0 * step, y1 = (r1 + 1) * step;
    // 回傳整張卡的範圍，sprite 裁切交給 matchCard 試多組
    boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return boxes;
}

// 對一張卡試多組 sprite 裁切（大隻佔滿左半；小隻置中、旁邊常有煙霧特效），
// 取比對最高分的那組。回傳 { results, box } 或 null。
export function matchCard(img, card, lib, topN = 5) {
  const frs = [[0, 0.58], [0.15, 0.62], [0.05, 0.45]];
  let best = null;
  for (const [f0, f1] of frs) {
    const box = {
      x: card.x + Math.round(card.w * f0), y: card.y,
      w: Math.round(card.w * (f1 - f0)), h: card.h,
    };
    const desc = cropToDescriptor(img, box);
    if (!desc) continue;
    const results = match(desc, lib, topN);
    if (!results.length) continue;
    if (!best || results[0].score > best.results[0].score) best = { results, box, desc };
  }
  return best;
}

// 回傳 [{i, score}] 由高到低；剪影模式（極罕見）退回純形狀 IoU
export function match(desc, lib, topN = 5) {
  const scores = [];
  if (desc.silhouette) {
    for (let i = 0; i < lib.length; i++) scores.push({ i, score: iou(desc.mask, lib[i].mask) });
  } else {
    const hd = histOf(desc), bd = blocksOf(desc);
    for (let i = 0; i < lib.length; i++) {
      scores.push({ i, score: 0.65 * histSim(hd, histOf(lib[i])) + 0.35 * blockSim(bd, blocksOf(lib[i])) });
    }
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topN);
}
