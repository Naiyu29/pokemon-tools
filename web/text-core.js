// 我方隊伍畫面「認字」核心：卡片標題的白色寶可夢名 → 逐字筆畫密度描述子 →
// 與候選中文名（用裝置字體即時畫出來）比對。純計算、無 DOM 依賴，
// 瀏覽器與 node 測試共用。零網路、零 token 成本。
//
// 為什麼認字比認圖示準：隊伍畫面的圖示是動畫幀（張手、展翅），輪廓會變；
// 名字是固定字體的白字紫底，對比高又不會動。
export const GRID = 12; // 描述子 GRID×GRID

// 二值圖（Uint8Array，1=墨水）→ 置中等比縮放的 GRID×GRID 墨水密度
export function cellDescriptor(bin, w, h, x0, x1) {
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) {
    if (!bin[y * w + x]) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0 || (maxX - minX + 1) * (maxY - minY + 1) < 12) return null;
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const s = GRID / Math.max(cw, ch);
  const ow = Math.max(1, Math.round(cw * s)), oh = Math.max(1, Math.round(ch * s));
  const ox = (GRID - ow) >> 1, oy = (GRID - oh) >> 1;
  const out = new Float32Array(GRID * GRID);
  for (let i = 0; i < oh; i++) for (let j = 0; j < ow; j++) {
    // 取樣邊界用 floor（含端點取 floor((i+1)/s)-1），至少涵蓋一列/一行
    const sy0 = minY + Math.floor(i / s);
    const sy1 = Math.min(maxY, minY + Math.max(Math.floor(i / s), Math.floor((i + 1) / s) - 1));
    const sx0 = minX + Math.floor(j / s);
    const sx1 = Math.min(maxX, minX + Math.max(Math.floor(j / s), Math.floor((j + 1) / s) - 1));
    let n = 0, tot = 0;
    for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) { tot++; if (bin[y * w + x]) n++; }
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

// 從卡片標題切出「名字」二值圖。回傳 {bin,w,h} 或 null
// img: {width,height,data(RGBA)}；card: detectTeamCards 的框
export function nameStrip(img, card) {
  const x0 = Math.max(0, Math.round(card.x + card.w * 0.11));
  const x1 = Math.min(img.width, Math.round(card.x + card.w * 0.62));
  // 從卡片上緣往下取：往上多取會吃到「上一張卡的下緣分隔線」，
  // 那條線會跟第一個字連成一塊，害切字整組位移
  const y0 = Math.max(0, Math.round(card.y + card.h * 0.01));
  const y1 = Math.min(img.height, Math.round(card.y + card.h * 0.25));
  const w = x1 - x0, h = y1 - y0;
  if (w < 20 || h < 12) return null;
  const bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * img.width + x0 + x) * 4;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mn > 195 && mx - mn < 40) bin[y * w + x] = 1; // 純白字
  }
  // 卡片分隔橫線：同列連續墨水超過一個字寬 → 抹掉（CJK 筆畫不會這麼長），
  // 不抹掉的話整排字會被連成一塊，切不出字
  for (let y = 0; y < h; y++) {
    let s = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && bin[y * w + x];
      if (on && s < 0) s = x;
      else if (!on && s >= 0) {
        if (x - s > h * 0.9) for (let k = s; k < x; k++) bin[y * w + k] = 0;
        s = -1;
      }
    }
  }
  // 垂直投影分群：名字與右邊性別／屬性圖示之間有一個明顯最大的空隙
  const runs = [];
  let s = -1;
  for (let x = 0; x <= w; x++) {
    let on = false;
    if (x < w) for (let y = 0; y < h; y++) if (bin[y * w + x]) { on = true; break; }
    if (on && s < 0) s = x;
    else if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  if (!runs.length) return null;
  // 依間隙把 runs 分群：字與字之間只差幾 px，名字與右邊圖示（或左邊
  // 凸進來的 sprite 碎片）之間差很多。取「墨水最多」的那群＝名字。
  const GAP = h * 0.25;
  const groups = [[runs[0]]];
  for (let k = 1; k < runs.length; k++) {
    if (runs[k][0] - runs[k - 1][1] - 1 > GAP) groups.push([]);
    groups[groups.length - 1].push(runs[k]);
  }
  let best = null, bestInk = -1;
  for (const g of groups) {
    let ink = 0;
    for (const [a, b] of g) for (let x = a; x <= b; x++) for (let y = 0; y < h; y++) ink += bin[y * w + x];
    if (ink > bestInk) { bestInk = ink; best = g; }
  }
  // 同一排字共用上下緣；sprite 凸進來的白色碎片高度對不上 → 丟掉。
  // （熾焰咆哮虎的白牙會黏在名字左邊，不濾掉會多切出一個「字」）
  const ext = best.map(([a, b]) => {
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
  const okRun = i => ext[i][0] >= 0
    && Math.abs(ext[i][0] - m0) <= textH * 0.45 && Math.abs(ext[i][1] - m1) <= textH * 0.45
    && ext[i][1] - ext[i][0] + 1 >= textH * 0.4;
  // 頭尾先修掉不合格的（分隔線碎片、sprite 白點都出現在兩端），
  // 中間的 run 一律保留——筆畫本來就可能被切開
  let lo = 0, hi = best.length - 1;
  while (lo < hi && !okRun(lo)) lo++;
  while (hi > lo && !okRun(hi)) hi--;
  const use = best.slice(lo, hi + 1);
  const nx0 = use[0][0], nx1 = use[use.length - 1][1];
  let ny0 = -1, ny1 = -1;
  for (let y = 0; y < h; y++) {
    let on = false;
    for (let x = nx0; x <= nx1; x++) if (bin[y * w + x]) { on = true; break; }
    if (on) { if (ny0 < 0) ny0 = y; ny1 = y; }
  }
  if (ny0 < 0) return null;
  const nw = nx1 - nx0 + 1, nh = ny1 - ny0 + 1;
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) out[y * nw + x] = bin[(ny0 + y) * w + nx0 + x];
  return { bin: out, w: nw, h: nh };
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
      const d = cellDescriptor(bin, w, h, Math.round(i * cw), Math.round((i + 1) * cw));
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
