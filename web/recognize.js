// M4 截圖辨識 UI：分享/選圖 → 自動偵測 6 張對手卡 → 端上樣板比對 →
// 每張卡列 top-5 候選（預選第 1 名）＋🔍搜尋自選，整批「取代」對手清單；也可點圖手動框選。
// 比對在本機毫秒級完成，零網路、零 token 成本
import { parseLib, cropToDescriptor, match, matchCard, detectFoeCards, SIZE } from './match-core.js';
import meta from '../data/sprite-meta.json';

let lib = null;          // 描述子庫（首次開啟時 fetch，之後 SW 快取離線可用）
let deps = null;         // { zhOf, onAdd, onReplace, search, pickedHtml, onClose }
let img = null;          // ImageBitmap
let imgData = null;      // 全圖 ImageData（比對用）
let box = null;          // 手動框 {x,y,w,h} 影像座標
let boxRel = 0.14;       // 手動框大小（相對影像短邊）
let cards = [];          // 自動偵測到的卡片框
let autoRows = [];       // [{cands:[{i,name,score}], sel}] 每張卡的候選與選擇
let searchRow = -1;      // 目前展開搜尋自選的卡列

const $ = s => document.querySelector(s);
function esc(s) { return ('' + s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

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
  try {
    const res = await fetch('sprite-index.bin');
    if (!res.ok) throw new Error(res.status);
    lib = parseLib(await res.arrayBuffer(), meta.count, meta.champ);
    return true;
  } catch (e) {
    $('#rgStatus').textContent = '⚠ 圖庫載入失敗（離線且尚未快取？）';
    return false;
  }
}

export async function openRecognize(blob) {
  $('#recogView').hidden = false;
  document.body.style.overflow = 'hidden';
  ensureLib();
  if (blob) loadImage(blob);
  else if (!img) $('#rgStatus').textContent = '選一張對戰／選角截圖開始';
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

// ---- 一次辨識全部：偵測對手卡（右側紅卡）→ 各卡出 top-3 候選 ----
async function runAuto() {
  if (!imgData || !(await ensureLib())) return;
  cards = detectFoeCards(imgData);
  draw();
  if (cards.length < 3) {
    $('#rgStatus').textContent = '沒偵測到對手卡片（要包含右側紅色卡列的截圖）；也可以直接點圖示位置手動辨識。';
    return;
  }
  autoRows = [];
  searchRow = -1;
  for (const card of cards) {
    const m = matchCard(imgData, card, lib, 15);
    if (!m) { autoRows.push({ cands: [], sel: -1 }); continue; }
    // 同名（色違列）去重取前 5
    const seen = new Set(); const cands = [];
    for (const r of m.results) {
      const name = meta.names[r.i];
      if (seen.has(name)) continue;
      seen.add(name);
      cands.push({ i: r.i, name, score: r.score });
      if (cands.length >= 5) break;
    }
    autoRows.push({ cands, sel: cands.length ? 0 : -1 });
  }
  $('#rgStatus').textContent = `偵測到 ${cards.length} 張對手卡。點候選改選、再點取消；都不對按 🔍 搜尋自選。`;
  renderAuto();
}

function renderAuto() {
  const wrap = $('#rgCands');
  wrap.innerHTML = autoRows.map((row, ri) => {
    const candsHtml = row.cands.map((c, ci) => `
      <button class="cand ${row.sel === ci ? 'sel' : ''}" data-row="${ri}" data-ci="${ci}">
        <canvas width="${SIZE}" height="${SIZE}" data-th="${c.i}"></canvas>
        <span>${esc(deps.zhOf(c.name))}</span>
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
    ? `<button class="btn" id="rgAddAll" style="width:100%;margin-top:8px">✓ 用勾選的 ${autoRows.filter(r => r.sel >= 0).length} 隻取代對手</button>`
    : '');
  for (const c of wrap.querySelectorAll('canvas[data-th]')) drawThumb(c, +c.dataset.th);
  const addAll = $('#rgAddAll');
  if (addAll) addAll.onclick = () => {
    const names = autoRows.filter(r => r.sel >= 0).map(r => r.cands[r.sel].name);
    const n = deps.onReplace(names);
    $('#rgStatus').textContent = `✓ 對手已換成這 ${n} 隻；到「紀錄」登錄勝敗時會自動帶這批對手。`;
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
    row.cands.unshift({ i: i >= 0 ? i : 0, name, score: null });
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
  for (const r of match(desc, lib, 12)) {
    const name = meta.names[r.i];
    if (seen.has(name)) continue;
    seen.add(name);
    cands.push({ i: r.i, name, score: r.score });
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
