// M4 截圖辨識 UI：分享/選圖 → 自動偵測 6 張對手卡 → 端上樣板比對 →
// 每張卡列 top-3 候選（預選第 1 名），一鍵全部加入；也可點圖手動框選。
// 比對在本機毫秒級完成，零網路、零 token 成本
import { parseLib, cropToDescriptor, match, matchCard, detectFoeCards, SIZE } from './match-core.js';
import meta from '../data/sprite-meta.json';

let lib = null;          // 描述子庫（首次開啟時 fetch，之後 SW 快取離線可用）
let deps = null;         // { zhOf(name), onAdd(name), pickedHtml(), onClose() }
let img = null;          // ImageBitmap
let imgData = null;      // 全圖 ImageData（比對用）
let box = null;          // 手動框 {x,y,w,h} 影像座標
let boxRel = 0.14;       // 手動框大小（相對影像短邊）
let cards = [];          // 自動偵測到的卡片框
let autoRows = [];       // [{cands:[{i,name,score}], sel}] 每張卡的候選與選擇

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
    lib = parseLib(await res.arrayBuffer(), meta.count);
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
  const MAXW = 1600;
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
  for (const card of cards) {
    const m = matchCard(imgData, card, lib, 10);
    if (!m) { autoRows.push({ cands: [], sel: -1 }); continue; }
    // 同名（色違列）去重取前 3
    const seen = new Set(); const cands = [];
    for (const r of m.results) {
      const name = meta.names[r.i];
      if (seen.has(name)) continue;
      seen.add(name);
      cands.push({ i: r.i, name, score: r.score });
      if (cands.length >= 3) break;
    }
    autoRows.push({ cands, sel: cands.length ? 0 : -1 });
  }
  $('#rgStatus').textContent = `偵測到 ${cards.length} 張對手卡，點候選可改選/取消；也可點圖手動補。`;
  renderAuto();
}

function renderAuto() {
  const wrap = $('#rgCands');
  wrap.innerHTML = autoRows.map((row, ri) => {
    if (!row.cands.length) return `<div class="autorow"><span class="hint">卡${ri + 1}：認不出來，點圖手動框</span></div>`;
    return `<div class="autorow">` + row.cands.map((c, ci) => `
      <button class="cand ${row.sel === ci ? 'sel' : ''}" data-row="${ri}" data-ci="${ci}">
        <canvas width="${SIZE}" height="${SIZE}" data-th="${c.i}"></canvas>
        <span>${esc(deps.zhOf(c.name))}</span><span class="pct">${Math.round(c.score * 100)}</span>
      </button>`).join('') + `</div>`;
  }).join('') +
  (autoRows.some(r => r.sel >= 0)
    ? `<button class="btn" id="rgAddAll" style="width:100%;margin-top:8px">加入勾選的 ${autoRows.filter(r => r.sel >= 0).length} 隻 →</button>`
    : '');
  for (const c of wrap.querySelectorAll('canvas[data-th]')) drawThumb(c, +c.dataset.th);
  const addAll = $('#rgAddAll');
  if (addAll) addAll.onclick = () => {
    let ok = 0;
    for (const row of autoRows) {
      if (row.sel < 0) continue;
      if (deps.onAdd(row.cands[row.sel].name)) ok++;
    }
    $('#rgStatus').textContent = `已加入 ${ok} 隻（重複/超過 6 隻的會略過）。`;
    renderPicked();
  };
}

function onCandsClick(ev) {
  const b = ev.target.closest('button.cand');
  if (!b) return;
  if (b.dataset.row !== undefined) {
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
