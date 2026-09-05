// M4 截圖辨識 UI：分享/選圖 → 自動偵測 6 張對手卡 → 端上樣板比對 →
// 每張卡列 top-5 候選（預選第 1 名）＋🔍搜尋自選，整批「取代」對手清單；也可點圖手動框選。
// 比對在本機毫秒級完成，零網路、零 token 成本
import { parseLib, cropToDescriptor, match, matchCard, matchTeamCard, detectFoeCards, detectTeamCards, SIZE, BYTES_PER } from './match-core.js';
import { nameStrip, matchName, cellDescriptor, GRID } from './text-core.js';
import meta from '../data/sprite-meta.json';

let lib = null;          // 描述子庫（首次開啟時 fetch，之後 SW 快取離線可用）
let deps = null;         // { zhOf, onAdd, onReplace, search, pickedHtml, onClose }
let img = null;          // ImageBitmap
let imgData = null;      // 全圖 ImageData（比對用）
let box = null;          // 手動框 {x,y,w,h} 影像座標
let boxRel = 0.14;       // 手動框大小（相對影像短邊）
let cards = [];          // 自動偵測到的卡片框
let autoRows = [];       // [{cands:[{i,name,score,zh}], sel}] 每張卡的候選與選擇
let mode = 'foe';        // 'foe'＝對手選角畫面（認圖示）｜'team'＝我方隊伍畫面（認名字）

// ---- 我方隊伍畫面：用裝置字體把候選中文名畫出來，跟截圖上的字比筆畫分布 ----
// 隊伍畫面的圖示是動畫幀（張手、展翅），輪廓會變；名字是固定字體，認字穩得多。
const glyphCache = new Map();
let glyphCanvas = null;
function glyphDesc(ch) {
  if (glyphCache.has(ch)) return glyphCache.get(ch);
  if (!glyphCanvas) {
    glyphCanvas = document.createElement('canvas');
    glyphCanvas.width = glyphCanvas.height = 96;
  }
  const ctx = glyphCanvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = '#fff';
  ctx.font = '64px system-ui, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(ch, 48, 50);
  const im = ctx.getImageData(0, 0, 96, 96);
  const bin = new Uint8Array(96 * 96);
  for (let p = 0; p < 96 * 96; p++) bin[p] = im.data[p * 4] > 96 ? 1 : 0;
  const d = cellDescriptor(bin, 96, 96, 0, 96);
  glyphCache.set(ch, d);
  return d;
}
let searchRow = -1;      // 目前展開搜尋自選的卡列

const $ = s => document.querySelector(s);
function esc(s) { return ('' + s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// 選角/準備畫面不可能出現 Mega 型態（進場後才 Mega），候選直接排除
const isMega = n => /-Mega(-|$)/.test(n);
// 對手候選只出「冠軍會出現的」：遊戲圖示名單（champ 旗標）∪ 威脅庫（名單落差保險），
// 使用者 2026-09-05 指示直接剔除不可能出現的寶可夢；🔍 搜尋自選不受限
let allowNames = null;
function inRoster(name) {
  if (!allowNames) {
    allowNames = new Set(deps && deps.threatNames ? deps.threatNames : []);
    for (let i = 0; i < meta.count; i++) if (meta.champ && meta.champ[i] === '1') allowNames.add(meta.names[i]);
  }
  return allowNames.has(name);
}

export function initRecognize(d) {
  deps = d;
  $('#rgClose').onclick = close;
  $('#rgDone').onclick = () => { close(); deps.onClose(); };
  $('#rgPick').onclick = () => $('#rgFile').click();
  $('#rgFile').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0];
    if (f) loadImage(f);
    ev.target.value = '';
  });
  $('#rgSize').addEventListener('input', ev => {
    boxRel = +ev.target.value / 100;
    if (box) {
      const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      setBox(c.x, c.y);
      runManual();
    }
  });
  const cv = $('#rgCanvas');
  cv.addEventListener('pointerdown', ev => {
    if (!img) return;
    const r = cv.getBoundingClientRect();
    const sx = img.width / r.width;
    setBox((ev.clientX - r.left) * sx, (ev.clientY - r.top) * sx);
    runManual();
  });
  $('#rgCands').addEventListener('click', onCandsClick);
  $('#rgMode').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-m]');
    if (!b || b.dataset.m === mode) return;
    mode = b.dataset.m;
    syncMode();
    if (imgData) runAuto();
  });
  syncMode();
}

function syncMode() {
  document.querySelectorAll('#rgMode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
}

function setBox(cx, cy) {
  const s = Math.round(Math.min(img.width, img.height) * boxRel);
  box = {
    x: Math.round(Math.min(Math.max(cx - s / 2, 0), img.width - s)),
    y: Math.round(Math.min(Math.max(cy - s / 2, 0), img.height - s)),
    w: s, h: s,
  };
  draw();
}

function draw() {
  const cv = $('#rgCanvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.lineWidth = Math.max(2, img.width / 250);
  ctx.strokeStyle = '#57d18a';
  for (let c = 0; c < cards.length; c++) {
    ctx.strokeRect(cards[c].x, cards[c].y, cards[c].w, cards[c].h);
  }
  if (box) {
    ctx.strokeStyle = '#4da3ff';
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
}

async function ensureLib() {
  if (lib) return true;
  // 網址帶內容版本＋長度驗證：圖庫與名稱表必須同版，否則列序錯位、名字會整批對錯
  const url = 'sprite-index.bin?v=' + (meta.hash || meta.count);
  const expect = meta.count * BYTES_PER;
  try {
    let buf = await (await fetch(url)).arrayBuffer();
    if (buf.byteLength !== expect) {
      // 快取到舊版 → 強制走網路重抓一次
      buf = await (await fetch(url, { cache: 'reload' })).arrayBuffer();
    }
    if (buf.byteLength !== expect) throw new Error('版本不符');
    lib = parseLib(buf, meta.count, meta.champ);
    return true;
  } catch (e) {
    $('#rgStatus').textContent = '⚠ 圖庫載入失敗（' + e.message + '）：把 app 完全關閉重開再試。';
    return false;
  }
}

export async function openRecognize(blob) {
  $('#recogView').hidden = false;
  document.body.style.overflow = 'hidden';
  ensureLib();
  if (blob) loadImage(blob);
  else if (!img) $('#rgStatus').textContent = mode === 'team'
    ? '選一張「隊伍」畫面截圖開始'
    : '選一張對戰／選角截圖開始';
  renderPicked();
}

function close() {
  $('#recogView').hidden = true;
  document.body.style.overflow = '';
}

async function loadImage(blob) {
  try {
    img = await createImageBitmap(blob);
  } catch (e) {
    $('#rgStatus').textContent = '⚠ 讀不了這張圖';
    return;
  }
  // 太大的圖先縮（比對只需輪廓與色塊；也省記憶體）
  const MAXW = 2600; // 手機截圖多為 2400 寬：不縮才不會犧牲小隻 sprite 的辨識率
  if (img.width > MAXW) {
    const c = document.createElement('canvas');
    c.width = MAXW; c.height = Math.round(img.height * MAXW / img.width);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    img = await createImageBitmap(c);
  }
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  imgData = ctx.getImageData(0, 0, img.width, img.height);
  box = null; cards = []; autoRows = [];
  $('#rgCands').innerHTML = '';
  draw();
  runAuto();
}

// ---- 一次辨識全部：偵測卡片 → 各卡出 top-5 候選 ----
async function runAuto() {
  if (!imgData || !(await ensureLib())) return;
  searchRow = -1;
  autoRows = [];
  cards = mode === 'team' ? detectTeamCards(imgData) : detectFoeCards(imgData);
  draw();
  if (cards.length < 3) {
    $('#rgStatus').textContent = mode === 'team'
      ? '沒偵測到隊伍卡片（要「隊伍」畫面的截圖，紫色卡 2 欄 × 3 列）。'
      : '沒偵測到對手卡片（要包含右側紅色卡列的截圖）；也可以直接點圖示位置手動辨識。';
    return;
  }
  for (const card of cards) autoRows.push(mode === 'team' ? teamCandidates(card) : foeCandidates(card));
  $('#rgStatus').textContent = mode === 'team'
    ? `偵測到 ${cards.length} 張隊伍卡（認名字為主、圖示輔助）。點候選改選；都不對按 🔍 搜尋自選。`
    : `偵測到 ${cards.length} 張對手卡。點候選改選、再點取消；都不對按 🔍 搜尋自選。`;
  renderAuto();
}

function foeCandidates(card) {
  const m = matchCard(imgData, card, lib, 40);
  if (!m) return { cands: [], sel: -1 };
  // 同名（色違列）去重、排除 Mega（選角畫面顯示的是基礎型態），取前 5
  const seen = new Set(); const cands = [];
  for (const r of m.results) {
    const name = meta.names[r.i];
    if (seen.has(name) || isMega(name) || !inRoster(name)) continue;
    seen.add(name);
    // 縮圖固定用一般色那列（同名第一列；色違只在比對時參與，異色不是常態）
    cands.push({ i: meta.names.indexOf(name), name, score: r.score });
    if (cands.length >= 5) break;
  }
  return { cands, sel: cands.length ? 0 : -1 };
}

// 我方隊伍卡：名字比對為主，圖示分數當輔助（實測 12/12 真實截圖全中）
const SPRITE_ASSIST = 0.3;
function teamCandidates(card) {
  const strip = nameStrip(imgData, card);
  const byName = strip ? matchName(strip, deps.namesByLen, glyphDesc, 8) : [];
  if (!byName.length) return { cands: [], sel: -1 };
  const m = matchTeamCard(imgData, card, lib, 60);
  const sprite = new Map();
  for (const r of (m ? m.results : [])) {
    const nm = meta.names[r.i];
    if (isMega(nm)) continue; // 隊伍畫面顯示基礎名
    if (!sprite.has(nm) || sprite.get(nm) < r.score) sprite.set(nm, r.score);
  }
  const cands = byName.map(b => ({
    i: meta.names.indexOf(b.name),
    name: b.name,
    zh: b.zh,
    score: (1 - b.score) + SPRITE_ASSIST * (sprite.get(b.name) || 0),
  })).sort((a, b) => b.score - a.score).slice(0, 5);
  return { cands, sel: 0 };
}

function renderAuto() {
  const wrap = $('#rgCands');
  wrap.innerHTML = autoRows.map((row, ri) => {
    const candsHtml = row.cands.map((c, ci) => `
      <button class="cand ${mode === 'team' ? 'zh ' : ''}${row.sel === ci ? 'sel' : ''}" data-row="${ri}" data-ci="${ci}">
        ${c.i >= 0 ? `<canvas width="${SIZE}" height="${SIZE}" data-th="${c.i}"></canvas>` : ''}
        <span>${esc(c.zh || deps.zhOf(c.name))}</span>
        <span class="pct">${c.score == null ? '自選' : Math.round(c.score * 100)}</span>
      </button>`).join('');
    const searchBtn = `<button class="cand more" data-search="${ri}">🔍<span>自選</span></button>`;
    const searchBox = searchRow === ri ? `
      <div class="rgsearch">
        <input type="search" id="rgQ" placeholder="搜尋：中文／注音頭字／英文" autocomplete="off">
        <div class="results" id="rgQr"></div>
      </div>` : '';
    return `<div class="autorow">${row.cands.length ? '' : `<span class="cardno hint">卡${ri + 1} 認不出</span>`}${candsHtml}${searchBtn}</div>${searchBox}`;
  }).join('') +
  (autoRows.some(r => r.sel >= 0)
    ? `<button class="btn" id="rgAddAll" style="width:100%;margin-top:8px">✓ ${mode === 'team'
        ? `用這 ${autoRows.filter(r => r.sel >= 0).length} 隻設定我方隊伍`
        : `用勾選的 ${autoRows.filter(r => r.sel >= 0).length} 隻取代對手`}</button>`
    : '') +
  (mode === 'team'
    ? '<p class="hint">端上辨識只讀得到「是哪隻」，讀不到 EV／招式。已存過的隊伍會直接切換過去；新隊伍會先建骨架，配置再用 paste 或 Claude 連結補。</p>'
    : '');
  for (const c of wrap.querySelectorAll('canvas[data-th]')) drawThumb(c, +c.dataset.th);
  const addAll = $('#rgAddAll');
  if (addAll) addAll.onclick = () => {
    const names = autoRows.filter(r => r.sel >= 0).map(r => r.cands[r.sel].name);
    if (mode === 'team') {
      $('#rgStatus').textContent = deps.onTeam(names);
    } else {
      const n = deps.onReplace(names);
      $('#rgStatus').textContent = `✓ 對手已換成這 ${n} 隻；到「紀錄」登錄勝敗時會自動帶這批對手。`;
    }
    renderPicked();
  };
  if (searchRow >= 0) wireSearch();
}

// 每卡的搜尋自選：選到的直接插到該卡候選第一位並選取
function wireSearch() {
  const q = $('#rgQ'), qr = $('#rgQr');
  if (!q) return;
  q.addEventListener('input', () => {
    const rs = deps.search(q.value).slice(0, 8);
    qr.innerHTML = rs.map(e => `<div class="result" data-pick="${esc(e.n)}">
      <span class="zh">${esc(e.zh)}</span><span class="en">${esc(e.n)}</span></div>`).join('') ||
      (q.value.trim() ? '<p class="hint">找不到</p>' : '');
  });
  qr.addEventListener('click', ev => {
    const el = ev.target.closest('[data-pick]');
    if (!el) return;
    const row = autoRows[searchRow];
    const name = el.dataset.pick;
    const i = meta.names.indexOf(name);
    row.cands = row.cands.filter(c => c.name !== name);
    row.cands.unshift({ i: i >= 0 ? i : 0, name, zh: deps.zhOf(name), score: null });
    row.sel = 0;
    searchRow = -1;
    renderAuto();
  });
  q.focus();
}

function onCandsClick(ev) {
  const b = ev.target.closest('button.cand');
  if (!b) return;
  if (b.dataset.search !== undefined) {
    // 開/關該卡的搜尋自選
    searchRow = searchRow === +b.dataset.search ? -1 : +b.dataset.search;
    renderAuto();
  } else if (b.dataset.row !== undefined) {
    // 自動模式：點候選＝改選；再點一次＝取消（該卡不加入）
    const row = autoRows[+b.dataset.row];
    const ci = +b.dataset.ci;
    row.sel = row.sel === ci ? -1 : ci;
    renderAuto();
  } else if (b.dataset.name) {
    // 手動模式：點候選＝直接加入
    const ok = deps.onAdd(b.dataset.name);
    $('#rgStatus').textContent = ok ? `已加入：${deps.zhOf(b.dataset.name)}` : '加不進去（已滿 6 隻或重複）';
    renderPicked();
  }
}

// ---- 手動模式：點圖示位置 → 框選比對 ----
async function runManual() {
  if (!img || !box || !(await ensureLib())) return;
  const desc = cropToDescriptor(imgData, box);
  const wrap = $('#rgCands');
  if (!desc) {
    wrap.innerHTML = '<p class="hint">框裡認不出前景，換個位置或調整框大小試試。</p>';
    return;
  }
  const seen = new Set(); const cands = [];
  for (const r of match(desc, lib, 40)) {
    const name = meta.names[r.i];
    if (seen.has(name) || isMega(name) || !inRoster(name)) continue;
    seen.add(name);
    cands.push({ i: meta.names.indexOf(name), name, score: r.score });
    if (cands.length >= 5) break;
  }
  wrap.innerHTML = (desc.silhouette ? '<p class="hint">偵測到剪影，只比形狀（信心較低）</p>' : '') +
    cands.map(c => `
      <button class="cand" data-name="${esc(c.name)}">
        <canvas width="${SIZE}" height="${SIZE}" data-th="${c.i}"></canvas>
        <span>${esc(deps.zhOf(c.name))}</span><span class="pct">${Math.round(c.score * 100)}</span>
      </button>`).join('');
  for (const c of wrap.querySelectorAll('canvas[data-th]')) drawThumb(c, +c.dataset.th);
}

function drawThumb(canvas, i) {
  const ctx = canvas.getContext('2d');
  const d = ctx.createImageData(SIZE, SIZE);
  const e = lib[i];
  for (let p = 0; p < SIZE * SIZE; p++) {
    if ((e.mask[p >> 3] >> (p & 7)) & 1) {
      d.data[p * 4] = e.rgb[p * 3]; d.data[p * 4 + 1] = e.rgb[p * 3 + 1];
      d.data[p * 4 + 2] = e.rgb[p * 3 + 2]; d.data[p * 4 + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
}

function renderPicked() {
  $('#rgPicked').innerHTML = deps.pickedHtml();
}
