// Champions「隊伍」畫面判讀：把兩張截圖讀成完整的隊伍配置。
//   狀態頁 → 名字＋六維數值＋SP 點數（→ EV）＋性格（由數值反推）
//   能力頁 → 名字＋特性＋道具＋4 招
// 兩張都靠「認字」（固定字體、白字紫底），比對圖示不動——圖示是動畫幀會變形。
// 全部在瀏覽器端算，零網路零 token。
import {
  binRegion, stripRules, inkRuns, groupRuns, cutStrip, textStrip, matchName, cellDescriptor,
  digitDescriptor, digitDistance,
} from './text-core.js';

// 卡片內的版面（相對卡片寬高的比例；由 2404×1080 實機截圖量出來，等比例縮放通用）
const L = {
  // 狀態頁：3 列 × 2 欄，每格是「數值 ——— SP點數」
  statRowsY: [[0.28, 0.46], [0.50, 0.68], [0.72, 0.90]],
  statColsX: [[0.24, 0.50], [0.74, 0.97]],
  // 能力頁：左欄特性／道具，右欄 4 招
  ability: [0.11, 0.28, 0.58, 0.47],
  item: [0.11, 0.52, 0.58, 0.71],
  moveX: [0.655, 1.0],
  iconX: [0.611, 0.648],
  moveY0: 0.03, moveDY: 0.245, moveH: 0.19,
};
// 招式左邊的屬性圖示：顏色→屬性。用來把候選縮到同屬性（2 字招式最容易認錯，
// 地震/纏繞、踩腳/踩踏、龍爪/龍息 都靠這個分開）。
// 色值由使用者 2026-09-05 的真實截圖量得（同一色重複出現時標準差近 0，是固定調色盤）；
// 沒量到的屬性（電/冰/超能力/幽靈/鋼）不列 → 顏色比不上就不加權，不會亂扣分。
const TYPE_PALETTE = [
  ['Normal', [162, 161, 156]], ['Fire', [211, 38, 38]], ['Water', [44, 128, 240]],
  ['Grass', [64, 160, 40]], ['Poison', [144, 64, 204]], ['Ground', [144, 80, 32]],
  ['Rock', [176, 168, 128]], ['Bug', [144, 160, 24]], ['Dark', [80, 64, 64]],
  ['Dragon', [80, 96, 224]], ['Fighting', [255, 129, 15]], ['Fairy', [240, 112, 240]],
  ['Flying', [128, 184, 240]],
];
const TYPE_MATCH_MAX = 46; // 色距超過這個就當「不確定」，不加權

// 取一塊圖示的代表色（排除卡片底色、白色字形、深色描邊），回傳屬性名或 null
function iconType(img, card, fr) {
  const x0 = Math.max(0, Math.round(card.x + card.w * fr[0]));
  const x1 = Math.min(img.width, Math.round(card.x + card.w * fr[2]));
  const y0 = Math.max(0, Math.round(card.y + card.h * fr[1]));
  const y1 = Math.min(img.height, Math.round(card.y + card.h * fr[3]));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  // 卡片底色：取招式列之間的空白
  const bx0 = Math.round(card.x + card.w * 0.70), bx1 = Math.round(card.x + card.w * 0.95);
  const by0 = Math.round(card.y + card.h * 0.45), by1 = Math.round(card.y + card.h * 0.50);
  const bs = [[], [], []];
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x += 2) {
    const i = (y * img.width + x) * 4;
    bs[0].push(img.data[i]); bs[1].push(img.data[i + 1]); bs[2].push(img.data[i + 2]);
  }
  if (bs[0].length < 10) return null;
  const med = a => a.sort((p, q) => p - q)[a.length >> 1];
  const bg = [med(bs[0]), med(bs[1]), med(bs[2])];
  const px = [[], [], []];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (d > 45 && mn < 175 && mx >= 60) { px[0].push(r); px[1].push(g); px[2].push(b); }
  }
  if (px[0].length < 15) return null;
  const c = [med(px[0]), med(px[1]), med(px[2])];
  let best = null;
  for (const [t, p] of TYPE_PALETTE) {
    const d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
    if (!best || d < best.d) best = { t, d };
  }
  return best && best.d <= TYPE_MATCH_MAX ? best.t : null;
}

// 畫面上的六維順序：左欄 HP/攻擊/防禦，右欄 特攻/特防/速度
const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const TEXT_OPT = { thr: 180, adaptive: false };
// 數字的門檻要更高一點：太低的話反鋸齒會把「0」的中間填起來，變得像 8
const DIGIT_OPT = { thr: 190, adaptive: false };
const TYPE_BONUS = 0.05; // 屬性相符時的加權（值由真實截圖調出來）
const EV_PER_SP = 8;
const EV_MAX = 252;

// ---- 數字 ----
// 數字字形用裝置字體即時畫（跟中文一樣的做法），0–9 共 10 類，好認很多
// allow：限定每一位可能的數字（SP 只有 0–32，十位必是 0–3，收斂很多）
export function readDigits(strip, digitGlyph, allow) {
  if (!strip) return null;
  const runs = inkRuns(strip);
  if (!runs.length) return null;
  // 數字之間有小間隙，不會相連；每個 run 就是一個數字
  let out = '';
  for (let ri = 0; ri < runs.length; ri++) {
    const [a, b] = runs[ri];
    const pool = allow ? allow(ri, runs.length) : null;
    const cell = cutStrip(strip, a, b);
    if (!cell) return null;
    const d = digitDescriptor(cell.bin, cell.w, cell.h, 0, cell.w, cell.soft);
    if (!d) return null;
    let best = null;
    for (let n = 0; n <= 9; n++) {
      if (pool && !pool.includes(n)) continue;
      const g = digitGlyph(String(n));
      if (!g) continue;
      const score = digitDistance(d, g);
      if (!best || score < best.score) best = { n, score };
    }
    if (!best) return null;
    out += best.n;
  }
  return out;
}

// 一格「數值 ——— SP」→ {value, sp}
// 進度條是橘色/深藍，低彩度濾掉後只剩兩組白色數字，中間空隙很大
function readStatCell(img, card, fr, digitGlyph) {
  const o = binRegion(img, card, fr, DIGIT_OPT);
  if (!o) return null;
  stripRules(o, o.h * 1.2);
  const runs = inkRuns(o);
  if (runs.length < 2) return null;
  const groups = groupRuns(runs, o.h * 0.35);
  if (groups.length < 2) return null;
  const first = groups[0], last = groups[groups.length - 1];
  const value = readDigits(cutStrip(o, first[0][0], first[first.length - 1][1]), digitGlyph);
  // SP 是 0–32：兩位數時十位只可能是 0–3
  const sp = readDigits(cutStrip(o, last[0][0], last[last.length - 1][1]), digitGlyph,
    (i, n) => (n >= 2 && i === 0 ? [0, 1, 2, 3] : null));
  return { value: value == null ? null : +value, sp: sp == null ? null : +sp };
}

// 性格：讀能力名稱旁的箭頭（紅⇑＝提升、藍⇓＝下降），不靠數字。
// 為什麼不用數值反推：遊戲的數字字體很窄（「1」是一豎、無襯線底座），
// 跟任何裝置字體都對不起來，三位數 OCR 實測只有 ~30%；
// 箭頭是純色塊，實測 6/6 全中。
const ARROW_X = [[0.175, 0.225], [0.650, 0.700]];   // 左欄／右欄，緊接在能力名後面
const ARROW_STATS = [['hp', 'spa'], ['atk', 'spd'], ['def', 'spe']];

export function readNatureArrows(img, card) {
  let plus = null, minus = null;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const x0 = Math.max(0, Math.round(card.x + card.w * ARROW_X[c][0]));
    const x1 = Math.min(img.width, Math.round(card.x + card.w * ARROW_X[c][1]));
    const y0 = Math.max(0, Math.round(card.y + card.h * L.statRowsY[r][0]));
    const y1 = Math.min(img.height, Math.round(card.y + card.h * L.statRowsY[r][1]));
    let red = 0, blue = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const R = img.data[i], G = img.data[i + 1], B = img.data[i + 2];
      if (R > 150 && R > G + 50 && R > B + 40) red++;            // 紅⇑ ≈ (247,140,171)
      else if (B > 150 && B > R + 40 && G > R) blue++;           // 藍⇓ ≈ (135,195,238)
    }
    const k = ARROW_STATS[r][c];
    if (red > 12) plus = k;
    else if (blue > 12) minus = k;
  }
  return { plus, minus };
}

// {plus,minus} → 性格英文名（無加成的 5 種數值相同，統一回 Hardy）
export function natureFromArrows(arrows, natures) {
  if (!arrows || (!arrows.plus && !arrows.minus)) return 'Hardy';
  if (!arrows.plus || !arrows.minus) return null; // 只讀到一邊 → 不猜
  const hit = natures.find(n => n.plus === arrows.plus && n.minus === arrows.minus);
  return hit ? hit.name : null;
}

// ---- 狀態頁 ----
// 回傳 [{nameCands, stats, evs, nature, ok}]，順序＝畫面上的 1..6
export function readStatusPage(img, cards, ctx) {
  return cards.map(card => {
    const nameCands = ctx.matchCardName(img, card);
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const fr = [L.statColsX[c][0], L.statRowsY[r][0], L.statColsX[c][1], L.statRowsY[r][1]];
      cells.push(readStatCell(img, card, fr, ctx.digitGlyph));
    }
    // 畫面是「左欄由上到下、右欄由上到下」，cells 目前是列優先 → 重排
    const order = [0, 2, 4, 1, 3, 5]; // hp, atk, def, spa, spd, spe
    const seq = order.map(i => cells[i]);
    const evs = {};
    let spSum = 0;
    seq.forEach((c, i) => {
      if (!c || c.sp == null || c.sp > 32) return;   // SP 上限 32，超過一定是讀錯
      spSum += c.sp;
      const ev = Math.min(EV_MAX, c.sp * EV_PER_SP);
      if (ev > 0) evs[STAT_ORDER[i]] = ev;
    });
    const arrows = readNatureArrows(img, card);
    const nature = natureFromArrows(arrows, ctx.natures);
    const readOk = seq.every(c => c && c.sp != null && c.sp <= 32);
    return { nameCands, evs, nature, arrows, spSum, readOk };
  });
}

// ---- 能力頁 ----
// 回傳 [{nameCands, abilityCands, itemCands, moveCands[4]}]
export function readAbilityPage(img, cards, ctx) {
  return cards.map(card => {
    const nameCands = ctx.matchCardName(img, card);
    // 卡身的字比標題暗一階，門檻 180 是掃出來最好的（150 會把底紋也吃進來）
    const one = (fr, byLen) => {
      const strip = textStrip(img, card, fr, TEXT_OPT);
      return strip ? matchName(strip, byLen, ctx.glyph, 5) : [];
    };
    const moveCands = [];
    for (let j = 0; j < 4; j++) {
      const y0 = L.moveY0 + j * L.moveDY;
      let cands = one([L.moveX[0], y0, L.moveX[1], y0 + L.moveH], ctx.moveByLen);
      // 屬性圖示對得上就加權：同屬性的候選往前排
      const t = iconType(img, card, [L.iconX[0], y0 + 0.03, L.iconX[1], y0 + L.moveH - 0.03]);
      if (t && cands.length) {
        cands = cands.map(c => ({
          ...c,
          type: ctx.moveType(c.name),
          score: c.score - (ctx.moveType(c.name) === t ? TYPE_BONUS : 0),
        })).sort((a, b) => a.score - b.score);
      }
      moveCands.push(cands);
    }
    // Mega 石只屬於特定寶可夢：認到別隻的進化石一律往後排（同名不同石才難分）
    let itemCands = one(L.item, ctx.itemByLen);
    const sp = nameCands[0] && ctx.getSpecies ? ctx.getSpecies(nameCands[0].name) : null;
    if (sp && itemCands.length) {
      itemCands = itemCands.map(c => {
        const ms = ctx.megaStoneOf ? ctx.megaStoneOf(c.name) : null;
        const wrong = ms && !Object.keys(ms).some(k => ctx.toID(k) === ctx.toID(sp.name));
        return { ...c, score: c.score + (wrong ? 0.25 : 0) };
      }).sort((a, b) => a.score - b.score);
    }
    // Ｘ／Ｙ 兩款進化石只差最後一個字，字體不同時很容易挑錯 → 標記讓使用者確認
    const stoneAmbiguous = itemCands.length > 1
      && ctx.megaStoneOf && ctx.megaStoneOf(itemCands[0].name) && ctx.megaStoneOf(itemCands[1].name)
      && itemCands[0].zh.length === itemCands[1].zh.length
      && itemCands[0].zh.slice(0, -1) === itemCands[1].zh.slice(0, -1);
    return { nameCands, abilityCands: one(L.ability, ctx.abilityByLen), itemCands, moveCands, stoneAmbiguous };
  });
}

// ---- 合併兩張頁面 ----
// 以卡片位置（1..6）對齊；名字不一致時以「兩頁都認到同一隻」為準，
// 對不上就標記讓使用者確認——不要默默拿錯的資料去算傷害。
export function mergePages(statusRows, abilityRows, ctx) {
  const n = Math.max(statusRows ? statusRows.length : 0, abilityRows ? abilityRows.length : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const st = statusRows && statusRows[i];
    const ab = abilityRows && abilityRows[i];
    const stName = st && st.nameCands && st.nameCands[0];
    const abName = ab && ab.nameCands && ab.nameCands[0];
    const name = (stName && stName.name) || (abName && abName.name) || null;
    const nameMismatch = !!(stName && abName && stName.name !== abName.name);
    const spec = {
      name,
      zh: name ? ctx.zhOf(name) : '',
      evs: st ? st.evs : {},
      moves: ab ? ab.moveCands.map(c => (c[0] ? c[0].name : null)).filter(Boolean) : [],
      ability: ab && ab.abilityCands[0] ? ab.abilityCands[0].name : undefined,
      item: ab && ab.itemCands[0] ? ab.itemCands[0].name : undefined,
    };
    const nature = st ? st.nature : null;
    if (nature) spec.nature = nature;
    out.push({
      spec,
      slot: i + 1,
      spSum: st ? st.spSum : null,
      statusName: stName ? stName.zh : null,
      abilityName: abName ? abName.zh : null,
      nameMismatch,
      stoneAmbiguous: !!(ab && ab.stoneAmbiguous),
      natureOk: !!nature,
      arrows: st ? st.arrows : null,
      readOk: !!(st && st.readOk),
      cands: {
        name: (st && st.nameCands && st.nameCands.length ? st.nameCands : (ab && ab.nameCands)) || [],
        ability: ab ? ab.abilityCands : [],
        item: ab ? ab.itemCands : [],
        moves: ab ? ab.moveCands : [[], [], [], []],
      },
    });
  }
  return out;
}
