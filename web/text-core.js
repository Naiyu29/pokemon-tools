// 我方隊伍畫面「認字」核心：卡片標題的白色寶可夢名 → 逐字筆畫密度描述子 →
// 與候選中文名（用裝置字體即時畫出來）比對。純計算、無 DOM 依賴，
// 瀏覽器與 node 測試共用。零網路、零 token 成本。
//
// 為什麼認字比認圖示準：隊伍畫面的圖示是動畫幀（張手、展翅），輪廓會變；
// 名字是固定字體的白字紫底，對比高又不會動。
const GRID_DEFAULT = 12;      // 中文字描述子 GRID×GRID
export const GRID = GRID_DEFAULT;
// 數字要更細：字高只有 ~20px，12×12 會把「0」的中空填掉，變得跟 8 一樣
export const GRID_DIGIT = 20;

// 二值圖（Uint8Array，1=墨水）→ 置中等比縮放的 GRID×GRID 墨水密度
// keepAspect：以「高度」正規化並水平置中，保留字寬比例。
// 數字要用這個——0/6/8 一樣寬但 1 很窄，用長邊正規化會把 1 撐大變形，
// 跟參考字形對不起來（實測 1→4、6→8 全錯）。CJK 方塊字則用長邊正規化即可。
export function cellDescriptor(bin, w, h, x0, x1, soft, keepAspect, gridN) {
  const GRID = gridN || GRID_DEFAULT;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) {
    if (!bin[y * w + x]) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0 || (maxX - minX + 1) * (maxY - minY + 1) < 12) return null;
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const s = keepAspect ? GRID / ch : GRID / Math.max(cw, ch);
  const ow = Math.min(GRID, Math.max(1, Math.round(cw * s)));
  const oh = Math.min(GRID, Math.max(1, Math.round(ch * s)));
  const ox = (GRID - ow) >> 1, oy = (GRID - oh) >> 1;
  const out = new Float32Array(GRID * GRID);
  for (let i = 0; i < oh; i++) for (let j = 0; j < ow; j++) {
    // 取樣邊界用 floor（含端點取 floor((i+1)/s)-1），至少涵蓋一列/一行
    const sy0 = minY + Math.floor(i / s);
    const sy1 = Math.min(maxY, minY + Math.max(Math.floor(i / s), Math.floor((i + 1) / s) - 1));
    const sx0 = minX + Math.floor(j / s);
    const sx1 = Math.min(maxX, minX + Math.max(Math.floor(j / s), Math.floor((j + 1) / s) - 1));
    let n = 0, tot = 0;
    for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
      tot++;
      n += soft ? soft[y * w + x] : (bin[y * w + x] ? 1 : 0);
    }
    out[(oy + i) * GRID + ox + j] = tot ? n / tot : 0;
  }
  return out;
}

// Dice 距離：只看有墨水的地方，不被空白主導（用絕對值差會讓「2 字猜 5 字」也拿高分）
export function dice(a, b) {
  let inter = 0, sum = 0;
  for (let i = 0; i < a.length; i++) { inter += Math.min(a[i], b[i]); sum += a[i] + b[i]; }
  return sum ? 1 - 2 * inter / sum : 1;
}

// 把卡片上的一塊區域二值化成「淺色字」遮罩。
// fr = [x0,y0,x1,y1]（相對卡片寬高的比例）。回傳 {bin,w,h} 或 null。
// 門檻取相對值：標題名是純白，卡身的特性／道具／招式字稍暗（實測最亮約 235）
export function binRegion(img, card, fr, opt = {}) {
  const minThr = opt.thr == null ? 150 : opt.thr;
  const sat = opt.sat == null ? 45 : opt.sat;
  const adaptive = opt.adaptive !== false;
  const x0 = Math.max(0, Math.round(card.x + card.w * fr[0]));
  const x1 = Math.min(img.width, Math.round(card.x + card.w * fr[2]));
  const y0 = Math.max(0, Math.round(card.y + card.h * fr[1]));
  const y1 = Math.min(img.height, Math.round(card.y + card.h * fr[3]));
  const w = x1 - x0, h = y1 - y0;
  if (w < 12 || h < 8) return null;
  let peak = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * img.width + x0 + x) * 4;
    const mn = Math.min(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (mn > peak) peak = mn;
  }
  if (peak < minThr) return null;
  const thr = adaptive ? Math.max(minThr, peak * 0.82) : minThr;
  const bin = new Uint8Array(w * h);
  // 灰階墨水權重：保留反鋸齒邊緣，筆畫粗細才跟參考字形對得上
  // （純二值會把螢幕上的字削瘦，Dice 距離整個失準）
  const soft = new Float32Array(w * h);
  const loF = opt.lo == null ? 0.86 : opt.lo;
  const lo = thr * loF, span = Math.max(1, peak - lo);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * img.width + x0 + x) * 4;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    // 低彩度才算字：屬性圖示、道具圖示、性格箭頭都是彩色，會被排除
    if (mx - mn >= sat) continue;
    if (mn > thr) bin[y * w + x] = 1;                                   // 定位／切字用
    if (mn > lo) soft[y * w + x] = Math.min(1, (mn - lo) / span);        // 比對用
  }
  return { bin, soft, w, h };
}

// 抹掉過長的水平筆畫（卡片分隔線）——CJK 筆畫不會超過一個字寬
export function stripRules(o, maxLen) {
  const { bin, w, h } = o;
  const lim = maxLen || h * 0.9;
  for (let y = 0; y < h; y++) {
    let s = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && bin[y * w + x];
      if (on && s < 0) s = x;
      else if (!on && s >= 0) {
        if (x - s > lim) for (let k = s; k < x; k++) bin[y * w + k] = 0;
        s = -1;
      }
    }
  }
  return o;
}

// 垂直投影 → 連續墨水段
export function inkRuns(o) {
  const { bin, w, h } = o;
  const runs = [];
  let s = -1;
  for (let x = 0; x <= w; x++) {
    let on = false;
    if (x < w) for (let y = 0; y < h; y++) if (bin[y * w + x]) { on = true; break; }
    if (on && s < 0) s = x;
    else if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  return runs;
}

// 依間隙把墨水段分群（gap 大於門檻就切一群）
export function groupRuns(runs, gap) {
  if (!runs.length) return [];
  const groups = [[runs[0]]];
  for (let k = 1; k < runs.length; k++) {
    if (runs[k][0] - runs[k - 1][1] - 1 > gap) groups.push([]);
    groups[groups.length - 1].push(runs[k]);
  }
  return groups;
}

// 取出 [x0,x1] 這段、上下裁到墨水範圍，回傳可直接比對的 strip
export function cutStrip(o, x0, x1) {
  const { bin, w, h } = o;
  let y0 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    let on = false;
    for (let x = x0; x <= x1; x++) if (bin[y * w + x]) { on = true; break; }
    if (on) { if (y0 < 0) y0 = y; y1 = y; }
  }
  if (y0 < 0) return null;
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
  const out = new Uint8Array(nw * nh);
  const outSoft = o.soft ? new Float32Array(nw * nh) : null;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    out[y * nw + x] = bin[(y0 + y) * w + x0 + x];
    if (outSoft) outSoft[y * nw + x] = o.soft[(y0 + y) * w + x0 + x];
  }
  return { bin: out, soft: outSoft, w: nw, h: nh };
}

// 一塊區域 → 單一文字 strip（取墨水最多的那群、去掉頭尾對不上基線的雜訊）
export function textStrip(img, card, fr, opt) {
  const o = binRegion(img, card, fr, opt);
  if (!o) return null;
  stripRules(o);
  const runs = inkRuns(o);
  if (!runs.length) return null;
  const groups = groupRuns(runs, o.h * 0.25);
  let best = null, bestInk = -1;
  for (const g of groups) {
    let ink = 0;
    for (const [a, b] of g) for (let x = a; x <= b; x++) for (let y = 0; y < o.h; y++) ink += o.bin[y * o.w + x];
    if (ink > bestInk) { bestInk = ink; best = g; }
  }
  return trimEdges(o, best);
}

// 同一排字共用上下緣：頭尾高度／位置對不上的 run 修掉
function trimEdges(o, group) {
  const { bin, w, h } = o;
  const ext = group.map(([a, b]) => {
    let y0 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      let on = false;
      for (let x = a; x <= b; x++) if (bin[y * w + x]) { on = true; break; }
      if (on) { if (y0 < 0) y0 = y; y1 = y; }
    }
    return [y0, y1];
  });
  const midOf = k => {
    const v = ext.map(e => e[k]).filter(x => x >= 0).sort((p, q) => p - q);
    return v.length ? v[v.length >> 1] : 0;
  };
  const m0 = midOf(0), m1 = midOf(1), textH = Math.max(4, m1 - m0 + 1);
  // 每個 run 的墨水量：真正的字墨水多，分隔線碎片／sprite 白點很少。
  // 要「又矮又淡」才算雜訊——只看高度會把拉丁字母（ＤＤ金勾臂 的 Ｄ）誤砍
  const inkOf = ([a, b]) => {
    let n = 0;
    for (let x = a; x <= b; x++) for (let y = 0; y < h; y++) n += bin[y * w + x];
    return n;
  };
  const inks = group.map(inkOf);
  const medInk = [...inks].sort((p, q) => p - q)[inks.length >> 1] || 1;
  const ok = i => ext[i][0] >= 0
    && Math.abs(ext[i][0] - m0) <= textH * 0.45 && Math.abs(ext[i][1] - m1) <= textH * 0.45
    && (ext[i][1] - ext[i][0] + 1 >= textH * 0.4 || inks[i] >= medInk * 0.25);
  let lo = 0, hi = group.length - 1;
  while (lo < hi && !ok(lo)) lo++;
  while (hi > lo && !ok(hi)) hi--;
  const use = group.slice(lo, hi + 1);
  return cutStrip(o, use[0][0], use[use.length - 1][1]);
}

// 從卡片標題切出「名字」二值圖。回傳 {bin,w,h} 或 null
// img: {width,height,data(RGBA)}；card: detectTeamCards 的框
// 從卡片上緣往下取：往上多取會吃到「上一張卡的下緣分隔線」，
// 那條線會跟第一個字連成一塊，害切字整組位移
export function nameStrip(img, card) {
  // 標題名是純白，用固定門檻（改成相對門檻會變嚴、辨識率掉）
  return textStrip(img, card, [0.11, 0.01, 0.62, 0.25], { thr: 195, sat: 40, adaptive: false });
}

// 數字專用描述子：拉伸填滿 GRID_DIGIT×GRID_DIGIT（寬高各自正規化），
// 另外回報寬高比。遊戲的數字比一般字體窄，等高縮放後圈的大小對不上；
// 拉伸後形狀就對得起來，再用寬高比把「1」跟其他數字分開。
export function digitDescriptor(bin, w, h, x0, x1, soft) {
  const G = GRID_DIGIT;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) {
    if (!bin[y * w + x]) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  if (cw < 2 || ch < 4) return null;
  const d = new Float32Array(G * G);
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const sy0 = minY + Math.floor(i * ch / G), sy1 = Math.max(sy0, minY + Math.ceil((i + 1) * ch / G) - 1);
    const sx0 = minX + Math.floor(j * cw / G), sx1 = Math.max(sx0, minX + Math.ceil((j + 1) * cw / G) - 1);
    let n = 0, tot = 0;
    for (let y = sy0; y <= Math.min(sy1, maxY); y++) for (let x = sx0; x <= Math.min(sx1, maxX); x++) {
      tot++;
      n += soft ? soft[y * w + x] : (bin[y * w + x] ? 1 : 0);
    }
    d[i * G + j] = tot ? n / tot : 0;
  }
  return { d, ar: cw / ch };
}

// 數字距離：形狀（Dice）＋寬高比差（「1」比其他數字窄很多，這一項最有分辨力）
export function digitDistance(a, b) {
  return dice(a.d, b.d) + 0.5 * Math.abs(a.ar - b.ar);
}

// 名字比對：試 1~7 字（CJK 字格接近方形，比例不對的字數直接跳過），
// 每種切法跟同字數的候選名比，取總分最低。
// namesByLen: Map(字數 → [{zh, n}])；glyph(ch): 該字的 GRID×GRID 描述子（沒有回 null）
export function matchName(strip, namesByLen, glyph, topN = 5) {
  const { bin, w, h } = strip;
  const res = [];
  for (let n = 1; n <= 7; n++) {
    const cw = w / n;
    if (cw < h * 0.6 || cw > h * 1.7) continue;
    const list = namesByLen.get(n);
    if (!list || !list.length) continue;
    const cells = [];
    let bad = false;
    for (let i = 0; i < n; i++) {
      const d = cellDescriptor(bin, w, h, Math.round(i * cw), Math.round((i + 1) * cw), strip.soft);
      if (!d) { bad = true; break; }
      cells.push(d);
    }
    if (bad) continue;
    const asp = Math.abs(cw / h - 1) * 0.08; // 字格越不方，越可能是切錯字數
    for (const e of list) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const g = glyph(e.zh[i]);
        sum += g ? dice(cells[i], g) : 1;
      }
      res.push({ zh: e.zh, name: e.n, score: sum / n + asp });
    }
  }
  res.sort((a, b) => a.score - b.score);
  const seen = new Set(), out = [];
  for (const r of res) {
    if (seen.has(r.zh)) continue;
    seen.add(r.zh);
    out.push(r);
    if (out.length >= topN) break;
  }
  return out;
}
