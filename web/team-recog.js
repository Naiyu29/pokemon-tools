// 我方隊伍截圖辨識（獨立流程，跟對手辨識分開）：
// 讀兩張圖——「狀態」頁給 EV／性格，「能力」頁給特性／道具／招式——合併成完整配置。
// 認得不確定的欄位會標出來，建好隊伍後直接進編輯頁修（編輯頁本來就有中文搜尋）。
import { detectTeamCards, parseLib, matchTeamCard } from './match-core.js';
import { nameStrip, matchName, cellDescriptor, digitDescriptor, GRID_DIGIT } from './text-core.js';
import { readStatusPage, readAbilityPage, mergePages } from './team-ocr.js';
import meta from '../data/sprite-meta.json';

let deps = null;
let lib = null;
const shots = { status: null, ability: null };   // {img, cards, rows}
let merged = null;
let busy = false;

const $ = s => document.querySelector(s);
const esc = s => ('' + (s == null ? '' : s)).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- 字形：用裝置字體即時畫，跟螢幕上的字比筆畫分布（零網路、離線可用）----
const glyphCache = new Map();
const digitCache = new Map();
let cv = null;
function canvasBin(ch, size, box) {
  if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = box; }
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, box, box);
  ctx.fillStyle = '#fff';
  ctx.font = `${size}px system-ui, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(ch, box / 2, box / 2 + 2);
  const im = ctx.getImageData(0, 0, box, box);
  const bin = new Uint8Array(box * box);
  const soft = new Float32Array(box * box);
  for (let p = 0; p < box * box; p++) {
    const v = im.data[p * 4] / 255;
    soft[p] = v;
    bin[p] = v > 0.38 ? 1 : 0;
  }
  return { bin, soft, box };
}
function glyphDesc(ch) {
  if (glyphCache.has(ch)) return glyphCache.get(ch);
  const { bin, soft, box } = canvasBin(ch, 64, 96);
  const d = cellDescriptor(bin, box, box, 0, box, soft);
  glyphCache.set(ch, d);
  return d;
}
function digitDesc(ch) {
  if (digitCache.has(ch)) return digitCache.get(ch);
  const { bin, soft, box } = canvasBin(ch, 64, 96);
  const d = digitDescriptor(bin, box, box, 0, box, soft);
  digitCache.set(ch, d);
  return d;
}

export function initTeamRecog(d) {
  deps = d;
  $('#trClose').onclick = close;
  $('#trCancel').onclick = close;
  $('#trCreate').onclick = create;
  // 兩個選圖欄位是 render() 動態產生的，事件在那裡綁
}

export function openTeamRecog() {
  $('#teamRecogView').hidden = false;
  document.body.style.overflow = 'hidden';
  ensureLib();
  render();
}
function close() {
  $('#teamRecogView').hidden = true;
  document.body.style.overflow = '';
}

async function ensureLib() {
  if (lib) return true;
  try {
    const res = await fetch('sprite-index.bin');
    if (!res.ok) throw new Error(res.status);
    lib = parseLib(await res.arrayBuffer(), meta.count, meta.champ);
  } catch (e) {
    lib = null; // 圖庫載不到就純靠認字（名字仍可辨識，只是少了圖示輔助）
  }
  return !!lib;
}

// 名字：認字為主、sprite 分數輔助（實測 12/12）
function matchCardName(img, card) {
  const strip = nameStrip(img, card);
  const byName = strip ? matchName(strip, deps.namesByLen, glyphDesc, 8) : [];
  if (!byName.length) return [];
  if (!lib) return byName.map(b => ({ ...b, score2: 1 - b.score })).slice(0, 5);
  const m = matchTeamCard(img, card, lib, 60);
  const sprite = new Map();
  for (const r of (m ? m.results : [])) {
    const nm = meta.names[r.i];
    if (/-Mega(-|$)/.test(nm)) continue;      // 畫面顯示基礎名
    if (!sprite.has(nm) || sprite.get(nm) < r.score) sprite.set(nm, r.score);
  }
  return byName
    .map(b => ({ ...b, score2: (1 - b.score) + 0.3 * (sprite.get(b.name) || 0) }))
    .sort((a, b) => b.score2 - a.score2)
    .slice(0, 5);
}

function ocrCtx() {
  return {
    glyph: glyphDesc,
    digitGlyph: digitDesc,
    natures: deps.natures,
    zhOf: deps.zhOf,
    getSpecies: deps.getSpecies,
    moveType: deps.moveType,
    megaStoneOf: deps.megaStoneOf,
    toID: deps.toID,
    abilityByLen: deps.abilityByLen,
    itemByLen: deps.itemByLen,
    moveByLen: deps.moveByLen,
    matchCardName,
  };
}

async function loadShot(kind, blob) {
  if (busy) return;
  busy = true;
  setStatus(kind === 'status' ? '讀狀態頁…' : '讀能力頁…');
  try {
    await ensureLib();
    let bmp = await createImageBitmap(blob);
    const MAXW = 2600;
    if (bmp.width > MAXW) {
      const c = document.createElement('canvas');
      c.width = MAXW; c.height = Math.round(bmp.height * MAXW / bmp.width);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp = await createImageBitmap(c);
    }
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const cards = detectTeamCards(img);
    if (cards.length < 3) {
      shots[kind] = { error: '沒偵測到隊伍卡片（要「隊伍」畫面的截圖，紫色卡 2 欄 × 3 列）' };
    } else {
      const rows = kind === 'status'
        ? readStatusPage(img, cards, ocrCtx())
        : readAbilityPage(img, cards, ocrCtx());
      shots[kind] = { cards: cards.length, rows };
    }
  } catch (e) {
    shots[kind] = { error: '讀不了這張圖：' + e.message };
  }
  merged = (shots.status && shots.status.rows) || (shots.ability && shots.ability.rows)
    ? mergePages(shots.status && shots.status.rows, shots.ability && shots.ability.rows, ocrCtx())
    : null;
  busy = false;
  setStatus('');
  render();
}

function setStatus(t) { const el = $('#trStatus'); if (el) el.textContent = t; }

function slotHtml(kind, label, hint) {
  const s = shots[kind];
  const ok = s && s.rows;
  return `<div class="trslot ${ok ? 'ok' : ''}">
    <div class="t">
      <b>${label}</b>
      <span class="hint">${hint}</span>
    </div>
    <div class="s">${s ? (s.error ? `<span class="err">${esc(s.error)}</span>`
      : `<span class="ok">✓ 讀到 ${s.cards} 隻</span>`) : '<span class="hint">尚未選圖</span>'}</div>
    <button class="btn ghost sm" id="trPick_${kind}">${ok ? '換一張' : '選圖'}</button>
    <input type="file" accept="image/*" id="trFile_${kind}" hidden>
  </div>`;
}

function render() {
  const wrap = $('#trBody');
  const evTxt = evs => {
    const K = [['hp', 'HP'], ['atk', '攻'], ['def', '防'], ['spa', '特攻'], ['spd', '特防'], ['spe', '速']];
    const parts = K.filter(([k]) => evs[k]).map(([k, z]) => `${z}${evs[k]}`);
    return parts.length ? parts.join(' / ') : '（無配點）';
  };
  const rows = merged || [];
  wrap.innerHTML = slotHtml('status', '1️⃣ 狀態頁', '六維與 SP 點數 → EV、性格')
    + slotHtml('ability', '2️⃣ 能力頁', '特性、道具、四招')
    + (rows.length ? `<div class="card"><h2>辨識結果（${rows.length} 隻）</h2>
        ${rows.map(r => {
    const sp = r.spec;
    const warn = [];
    if (r.nameMismatch) warn.push('兩張圖的名字不一致');
    if (shots.status && shots.status.rows && !r.readOk) warn.push('SP 點數沒讀清楚');
    if (shots.status && shots.status.rows && !r.natureOk) warn.push('性格箭頭沒讀到');
    if (shots.ability && shots.ability.rows && (sp.moves || []).length < 4) warn.push('招式不足 4 個');
    if (r.stoneAmbiguous) warn.push('進化石 Ｘ／Ｙ 請確認');
    return `<div class="trrow ${warn.length ? 'warn' : ''}">
            <div class="n"><b>${esc(sp.zh || '?')}</b>
              <span class="hint">${esc(sp.nature ? deps.natureZh(sp.nature) : '性格?')}</span></div>
            <div class="d">${esc(deps.itemZh(sp.item) || '無道具')} · ${esc(deps.abilityZh(sp.ability) || '無特性')}</div>
            <div class="d">${esc(evTxt(sp.evs || {}))}</div>
            <div class="d">${(sp.moves || []).map(m => esc(deps.moveZh(m))).join('、') || '（沒讀到招式）'}</div>
            ${warn.length ? `<div class="w">⚠ ${esc(warn.join('、'))}</div>` : ''}
          </div>`;
  }).join('')}
        <p class="hint">端上辨識約有一成欄位會認錯（遊戲字體與手機字體不同）。
          建好隊伍後會直接進編輯頁，逐項確認、要改的用中文搜尋改掉。</p>
      </div>` : `<p class="hint">兩張都選好之後會顯示辨識結果。只選一張也可以（另一半留空，之後手動補）。</p>`);

  for (const kind of ['status', 'ability']) {
    const b = $(`#trPick_${kind}`);
    if (b) b.onclick = () => $(`#trFile_${kind}`).click();
    const f = $(`#trFile_${kind}`);
    if (f) f.onchange = async ev => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (file) await loadShot(kind, file);
    };
  }
  const create = $('#trCreate');
  create.disabled = !rows.length;
  create.textContent = rows.length ? `建立隊伍（${rows.length} 隻）並開始編輯` : '先選一張截圖';
}

function create() {
  if (!merged || !merged.length) return;
  const specs = merged.map(r => {
    const s = { ...r.spec };
    if (!s.name) return null;
    if (!s.moves || !s.moves.length) { s.moves = []; s.needsConfig = true; }
    return s;
  }).filter(Boolean);
  if (!specs.length) return;
  const d = new Date();
  deps.onCreate(`辨識隊伍 ${d.getMonth() + 1}/${d.getDate()}`, specs);
  close();
}
