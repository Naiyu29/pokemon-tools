// M4.2 端上辨識核心：截圖框選區 → 16×16 描述子 → 與 sprite 庫比對
// 純計算、無 DOM 依賴，瀏覽器與 node 測試腳本共用
export const SIZE = 16;
const PX = SIZE * SIZE;            // 256
const MASK_BYTES = PX / 8;         // 32
export const BYTES_PER = PX * 3 + MASK_BYTES; // 800

const POP = new Uint8Array(256);
for (let i = 0; i < 256; i++) POP[i] = (i & 1) + POP[i >> 1];

// sprite-index.bin → [{rgb:Uint8Array(768), mask:Uint8Array(32), champ}]
// champFlags：'0'/'1' 字串，1＝該列圖來自 Champions 遊戲本身（在本作登場名單內）
export function parseLib(arrayBuffer, count, champFlags) {
  const buf = new Uint8Array(arrayBuffer);
  const lib = [];
  for (let i = 0; i < count; i++) {
    const off = i * BYTES_PER;
    lib.push({
      rgb: buf.subarray(off, off + PX * 3),
      mask: buf.subarray(off + PX * 3, off + BYTES_PER),
      champ: champFlags ? champFlags[i] === '1' : false,
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
  // 卡片是同一直列、等寬：以中位數對齊 x 範圍，修掉被舞台燈光/特效拉歪的個別卡框
  if (boxes.length >= 3) {
    const medOf = arr => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
    const mx0 = medOf(boxes.map(b => b.x));
    const mw = medOf(boxes.map(b => b.w));
    for (const b of boxes) { b.x = mx0; b.w = mw; }
  }
  return boxes;
}

// ---- 我方隊伍畫面（狀態／能力頁）----
// 版面：紫色卡 2 欄 × 3 列，sprite 在每張卡左上角、會凸出到卡片上緣之外。
// 卡底紫實測 rgb≈(120,107,180)；頁面底紋是米黃(r>g>b)。
const isTeamPurple = (d, i) => {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return b > r + 18 && r > g + 5 && b - g > 45 && r > 70 && r < 205 && b < 235;
};
// 頁面米黃底紋（sprite 凸出卡片外的那截背景）
const isPageBg = (d, i) => {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return r > g && g > b && r > 195;
};
// 卡片的淺色描邊圓角、白色名字與 ♥／✱ 圖示：亮且幾乎無彩度。
// 實測描邊 rgb≈(223,207,208)、高光≈(196,191,247)、文字≈純白；
// sprite 的彩色部位彩度都遠高於此
const isUiLight = (d, i) => {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mn > 178 && mx - mn < 58;
};

// 由投影找連續帶（>thr 的列/欄群），回傳 [[起,迄]]
function bandsOf(counts, thr, minLen, maxGap) {
  const out = [];
  let s = -1, gap = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > thr) { if (s < 0) s = i; gap = 0; }
    else if (s >= 0 && ++gap > maxGap) { if (i - gap - s >= minLen) out.push([s, i - gap]); s = -1; }
  }
  if (s >= 0 && counts.length - s >= minLen) out.push([s, counts.length - 1]);
  return out;
}

// 偵測我方隊伍畫面的 6 張卡（2 欄 × 3 列），回傳 [{x,y,w,h}]（依遊戲編號 1..6 排序）
export function detectTeamCards(img) {
  const { width: w, height: h, data } = img;
  const step = Math.max(1, Math.round(w / 600));
  const rows = new Int32Array(Math.ceil(h / step));
  for (let y = 0; y < h; y += step) {
    let n = 0;
    for (let x = 0; x < w; x += step) if (isTeamPurple(data, (y * w + x) * 4)) n++;
    rows[y / step | 0] = n;
  }
  const rowMax = Math.max(...rows);
  if (rowMax < 10) return [];
  let rb = bandsOf(rows, rowMax * 0.3, Math.round((h / step) * 0.04), 1);
  if (rb.length < 2) return [];
  // 上方分頁列（Meta／玩家名）也是紫的，但比卡片矮很多——用最高帶的一半當門檻濾掉
  const tallest = Math.max(...rb.map(b => b[1] - b[0]));
  rb = rb.filter(b => b[1] - b[0] >= tallest * 0.5);
  if (rb.length > 3) rb = rb.slice(-3);
  // 欄帶只在卡列範圍內統計，避免分頁列干擾
  const cols = new Int32Array(Math.ceil(w / step));
  for (const [r0, r1] of rb) {
    for (let yi = r0; yi <= r1; yi++) {
      const y = yi * step;
      for (let x = 0; x < w; x += step) if (isTeamPurple(data, (y * w + x) * 4)) cols[x / step | 0]++;
    }
  }
  const colMax = Math.max(...cols);
  let cb = bandsOf(cols, colMax * 0.35, Math.round((w / step) * 0.06), 1);
  if (cb.length > 2) cb = cb.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 2).sort((a, b) => a[0] - b[0]);
  if (!cb.length) return [];
  const boxes = [];
  for (const [r0, r1] of rb) for (const [c0, c1] of cb) {
    boxes.push({ x: c0 * step, y: r0 * step, w: (c1 - c0 + 1) * step, h: (r1 - r0 + 1) * step });
  }
  return boxes;
}

// 隊伍卡的 sprite 區塊：跨在「卡片紫」與「頁面米黃」兩種底色上，
// cropToDescriptor 只認單一背景色，所以先把米黃與陰影塗成卡片紫再送進去。
export function teamSpritePatch(img, card, fr) {
  const x0 = Math.max(0, Math.round(card.x + card.w * fr[0]));
  const y0 = Math.max(0, Math.round(card.y + card.h * fr[1]));
  const x1 = Math.min(img.width, Math.round(card.x + card.w * fr[2]));
  const y1 = Math.min(img.height, Math.round(card.y + card.h * fr[3]));
  const pw = x1 - x0, ph = y1 - y0;
  if (pw < 16 || ph < 16) return null;
  // 卡片紫參考色：取卡片中段（避開 sprite 與文字）的中位數
  const sr = [], sg = [], sb = [];
  const my = Math.round(card.y + card.h * 0.55);
  for (let x = card.x + (card.w >> 3); x < card.x + card.w - (card.w >> 3); x += 3) {
    const i = (my * img.width + x) * 4;
    if (!isTeamPurple(img.data, i)) continue;
    sr.push(img.data[i]); sg.push(img.data[i + 1]); sb.push(img.data[i + 2]);
  }
  if (sr.length < 10) return null;
  const med = arr => arr.sort((a, b) => a - b)[arr.length >> 1];
  const bg = [med(sr), med(sg), med(sb)];
  const out = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const si = ((y0 + y) * img.width + x0 + x) * 4;
    const di = (y * pw + x) * 4;
    const r = img.data[si], g = img.data[si + 1], b = img.data[si + 2];
    // 卡片紫（標題列與卡身深淺不同、圓角高光也算）、頁面米黃、陰影邊：一律壓成同一底色，
    // 這樣 cropToDescriptor 的「邊框中位數估背景」才成立，剩下的前景就只有 sprite
    // 注意：不能把深色一起壓成背景——Champions sprite 有粗黑描邊，
    // 壓掉會沿著描邊把 sprite 切成互不相連的碎片，連通元件過濾只會留下一塊
    const flat = isTeamPurple(img.data, si) || isPageBg(img.data, si) || isUiLight(img.data, si);
    out[di] = flat ? bg[0] : r;
    out[di + 1] = flat ? bg[1] : g;
    out[di + 2] = flat ? bg[2] : b;
    out[di + 3] = 255;
  }
  return { width: pw, height: ph, data: out };
}

// 我方隊伍卡：試幾組 sprite 框，取最高分（同 matchCard 的做法）
export function matchTeamCard(img, card, lib, topN = 5) {
  // [左, 上, 右, 下]，相對卡片寬高；sprite 凸出卡片上緣故上界為負
  // 框要避開右邊的名字白字與下方的 ♥／✱ 圖示，只留 sprite
  const frs = [[-0.015, -0.17, 0.095, 0.26], [-0.03, -0.21, 0.115, 0.31], [0.0, -0.13, 0.085, 0.21]];
  let best = null;
  for (const fr of frs) {
    const patch = teamSpritePatch(img, card, fr);
    if (!patch) continue;
    const desc = cropToDescriptor(patch);
    if (!desc) continue;
    const results = match(desc, lib, topN);
    if (!results.length) continue;
    if (!best || results[0].score > best.results[0].score) {
      best = {
        results, desc,
        box: {
          x: Math.round(card.x + card.w * fr[0]), y: Math.round(card.y + card.h * fr[1]),
          w: Math.round(card.w * (fr[2] - fr[0])), h: Math.round(card.h * (fr[3] - fr[1])),
        },
      };
    }
  }
  return best;
}

// 對一張卡試多組 sprite 裁切（大隻佔滿左半；小隻置中、旁邊常有煙霧特效），
// 取比對最高分的那組。回傳 { results, box } 或 null。
export function matchCard(img, card, lib, topN = 5) {
  const frs = [[0, 0.58], [0.15, 0.62], [0.05, 0.45]];
  let best = null, bestRaw = -1;
  for (const [f0, f1] of frs) {
    const box = {
      x: card.x + Math.round(card.w * f0), y: card.y,
      w: Math.round(card.w * (f1 - f0)), h: card.h,
    };
    const desc = cropToDescriptor(img, box);
    if (!desc) continue;
    const results = match(desc, lib, topN);
    if (!results.length) continue;
    // 挑裁切用「原始相似度」（去掉名單加權）：避免裁到雜訊卻靠加權勝出
    const raw = Math.max(...results.map(r => r.score - (lib[r.i].champ ? CHAMP_BOOST : 0)));
    if (!best || raw > bestRaw) { best = { results, box, desc }; bestRaw = raw; }
  }
  return best;
}

// 回傳 [{i, score}] 由高到低；剪影模式（極罕見）退回純形狀 IoU。
// Champions 登場名單加權 +0.08：對手一定出自本作名單，撞色的路人優先度降低
// （真實截圖評估：top1 88.9%→93.3%、top5→100%）
const CHAMP_BOOST = 0.08;
export function match(desc, lib, topN = 5) {
  const scores = [];
  if (desc.silhouette) {
    for (let i = 0; i < lib.length; i++) scores.push({ i, score: iou(desc.mask, lib[i].mask) });
  } else {
    const hd = histOf(desc), bd = blocksOf(desc);
    for (let i = 0; i < lib.length; i++) {
      scores.push({
        i,
        score: 0.65 * histSim(hd, histOf(lib[i])) + 0.35 * blockSim(bd, blocksOf(lib[i])) +
          (lib[i].champ ? CHAMP_BOOST : 0),
      });
    }
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topN);
}
