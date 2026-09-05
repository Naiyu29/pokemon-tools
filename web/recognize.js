// M4 截圖辨識 UI：分享/選圖 → 點擊圖示位置 → 端上樣板比對 → top-5 候選一鍵加入對手
// 比對在本機毫秒級完成，零網路、零 token 成本
import { parseLib, cropToDescriptor, match, SIZE } from './match-core.js';
import meta from '../data/sprite-meta.json';

let lib = null;          // 描述子庫（首次開啟時 fetch，之後 SW 快取離線可用）
let deps = null;         // { zhOf(name), onAdd(name), onClose() }
let img = null;          // ImageBitmap
let imgData = null;      // 全圖 ImageData（比對用）
let box = null;          // {x,y,w,h} 影像座標
let boxRel = 0.14;       // 框大小（相對影像短邊）

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
      runMatch();
    }
  });
  const cv = $('#rgCanvas');
  cv.addEventListener('pointerdown', ev => {
    if (!img) return;
    const r = cv.getBoundingClientRect();
    const sx = img.width / r.width;
    setBox((ev.clientX - r.left) * sx, (ev.clientY - r.top) * sx);
    runMatch();
  });
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
  if (box) {
    ctx.strokeStyle = '#4da3ff';
    ctx.lineWidth = Math.max(2, img.width / 250);
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
  box = null;
  $('#rgCands').innerHTML = '';
  $('#rgStatus').textContent = '點截圖上的寶可夢圖示（框可用下方滑桿調大小）';
  draw();
}

async function runMatch() {
  if (!img || !box || !(await ensureLib())) return;
  const desc = cropToDescriptor(imgData, box);
  const wrap = $('#rgCands');
  if (!desc) {
    wrap.innerHTML = '<p class="hint">框裡認不出前景，換個位置或調整框大小試試。</p>';
    return;
  }
  const res = match(desc, lib, 5);
  wrap.innerHTML = (desc.silhouette ? '<p class="hint">偵測到剪影，只比形狀（信心較低）</p>' : '') +
    res.map(r => {
      const n = meta.names[r.i];
      return `<button class="cand" data-name="${esc(n)}">
        <canvas width="${SIZE}" height="${SIZE}" data-th="${r.i}"></canvas>
        <span>${esc(deps.zhOf(n))}</span><span class="pct">${Math.round(r.score * 100)}</span>
      </button>`;
    }).join('');
  for (const c of wrap.querySelectorAll('canvas[data-th]')) drawThumb(c, +c.dataset.th);
  wrap.querySelectorAll('.cand').forEach(b => b.onclick = () => {
    const ok = deps.onAdd(b.dataset.name);
    $('#rgStatus').textContent = ok ? `已加入：${deps.zhOf(b.dataset.name)}` : '加不進去（已滿 6 隻或重複）';
    renderPicked();
  });
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
