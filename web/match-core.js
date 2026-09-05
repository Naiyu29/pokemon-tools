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
  // 門檻：依邊框像素離散度自適應（邊框不會全是純色背景時放寬）
  const bd = border.map(dist).sort((a, b) => a - b);
  const thr = Math.max(38, bd[Math.floor(bd.length * 0.7)] * 1.4 + 12);

  const fg = new Uint8Array(bw * bh);
  let x0 = bw, y0 = bh, x1 = -1, y1 = -1;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (dist(at(x, y)) > thr) {
      fg[y * bw + x] = 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
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
  // 剪影判定：前景亮度變異很小（選角畫面的 sprite 剪影只有形狀資訊）
  const meanLum = (sr + sg + sb) / (3 * sn);
  const lumSd = Math.sqrt(Math.max(0, sq / sn - meanLum * meanLum));
  return { rgb, mask, silhouette: lumSd < 18 };
}

function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < MASK_BYTES; i++) {
    inter += POP[a[i] & b[i]];
    uni += POP[a[i] | b[i]];
  }
  return uni ? inter / uni : 0;
}

function colorSim(d, e) {
  let sum = 0, n = 0;
  for (let p = 0; p < PX; p++) {
    if (!bit(d.mask, p) || !bit(e.mask, p)) continue;
    const i = p * 3;
    sum += Math.hypot(d.rgb[i] - e.rgb[i], d.rgb[i + 1] - e.rgb[i + 1], d.rgb[i + 2] - e.rgb[i + 2]);
    n++;
  }
  if (!n) return 0;
  return 1 - sum / n / 442;
}

// 回傳 [{i, score}] 由高到低；剪影模式只看形狀
export function match(desc, lib, topN = 5) {
  const scores = [];
  for (let i = 0; i < lib.length; i++) {
    const s = desc.silhouette
      ? iou(desc.mask, lib[i].mask)
      : 0.55 * iou(desc.mask, lib[i].mask) + 0.45 * colorSim(desc, lib[i]);
    scores.push({ i, score: s });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topN);
}
