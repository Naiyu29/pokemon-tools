// 隊伍分頁（獨立頁面）：參考 Pokémon Showdown teambuilder 的兩層結構——
// 清單頁（所有隊伍）↔ 編輯頁（單隊 6 隻，每隻可展開改道具/特性/性格/EV/招式）。
// 手機優先：單欄、摺疊卡、大點擊區；選單一次只開一個（Showdown 的空間管理原則）。
// 全部在瀏覽器端，狀態存 localStorage。
import { TYPE_ZH, moveZh, abilityZh, itemZh } from './zh-names.js';

// 性格：官方繁中名＋加成（calc 的 nature 名要用英文）
export const NATURES = [
  ['Hardy', '勤奮'], ['Lonely', '怕寂寞'], ['Brave', '勇敢'], ['Adamant', '固執'], ['Naughty', '頑皮'],
  ['Bold', '大膽'], ['Docile', '坦率'], ['Relaxed', '悠閒'], ['Impish', '淘氣'], ['Lax', '樂天'],
  ['Timid', '膽小'], ['Hasty', '急躁'], ['Serious', '認真'], ['Jolly', '爽朗'], ['Naive', '天真'],
  ['Modest', '內斂'], ['Mild', '慢吞吞'], ['Quiet', '冷靜'], ['Bashful', '害羞'], ['Rash', '馬虎'],
  ['Calm', '溫和'], ['Gentle', '溫順'], ['Sassy', '自大'], ['Careful', '慎重'], ['Quirky', '浮躁'],
];
const STAT_ZH = { hp: 'HP', atk: '攻擊', def: '防禦', spa: '特攻', spd: '特防', spe: '速度' };
const EV_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
// Champions 用 SP 點數制：每項 0–32 點，EV = SP × 8（32 點→252，256 超過上限）。
// 總量由使用者自己的隊伍反推＝66 點（六隻裡五隻剛好用滿）＝528 EV；
// 這是推估值，所以只提示不強制夾限——夾限會把真實配點改掉。
const EV_PER_SP = 8;
const SP_MAX = 32;
const EV_STAT_MAX = 252;
const SP_BUDGET = 66;
const EV_BUDGET = SP_BUDGET * EV_PER_SP; // 528
const spOf = ev => Math.min(SP_MAX, Math.ceil(ev / EV_PER_SP));
const TYPE_COLOR = {
  Normal: '#9099a1', Fire: '#ff7a3d', Water: '#4b8fe2', Electric: '#e5c132', Grass: '#5cbf5c',
  Ice: '#61c8d8', Fighting: '#d1503c', Poison: '#a366c2', Ground: '#c99b4a', Flying: '#7ba3e8',
  Psychic: '#e8628f', Bug: '#8fb828', Rock: '#b8a45c', Ghost: '#6b6bc4', Dragon: '#6a5ce0',
  Dark: '#6b5b52', Steel: '#7f95a8', Fairy: '#e07ac4', Stellar: '#48c9b0',
};

let ctx = null;   // 由 main.js 注入的相依（見 initTeamBuilder）
let lists = null; // 道具／特性／招式 搜尋清單（第一次用到才建）

export function initTeamBuilder(c) { ctx = c; }

function buildLists() {
  if (lists) return lists;
  const { gen } = ctx;
  const mk = (iter, zhOf) => {
    const out = [];
    for (const e of iter) {
      if (!e || !e.name) continue;
      out.push({ name: e.name, zh: zhOf(e.name) });
    }
    return out.sort((a, b) => a.zh.localeCompare(b.zh, 'zh-Hant'));
  };
  lists = {
    items: mk(gen.items, itemZh),
    abilities: mk(gen.abilities, abilityZh),
    // 變化招也要能選（哈欠、看穿…），只濾掉沒名字的佔位
    moves: mk(gen.moves, moveZh).filter(m => m.name !== 'nomove'),
  };
  return lists;
}

// 中文包含／英文開頭或包含；沒輸入就給常用前幾筆
function pick(listName, q) {
  const list = buildLists()[listName];
  const s = (q || '').trim().toLowerCase();
  if (!s) return list.slice(0, 30);
  const out = [];
  for (const e of list) {
    const en = e.name.toLowerCase();
    let score = -1;
    if (e.zh.includes(q.trim())) score = 10;
    else if (en.startsWith(s)) score = 8;
    else if (en.includes(s)) score = 4;
    if (score >= 0) out.push([score, e]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, 30).map(x => x[1]);
}

// ---- 小工具 ----
const esc = s => ('' + (s == null ? '' : s)).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function speciesOf(spec) {
  return ctx.getSpecies(spec.mega || spec.name) || ctx.getSpecies(spec.name);
}
function typeChips(spec) {
  const sp = speciesOf(spec);
  if (!sp || !sp.types) return '';
  return sp.types.map(t =>
    `<span class="tchip" style="background:${TYPE_COLOR[t] || '#666'}">${esc(TYPE_ZH[t] || t)}</span>`).join('');
}
function zhOfSpec(spec) { return spec.zh || ctx.zhByName.get(spec.mega || spec.name) || spec.name; }
function evTotal(spec) { return EV_ORDER.reduce((n, k) => n + ((spec.evs && spec.evs[k]) || 0), 0); }
function natureZh(n) {
  const e = NATURES.find(x => x[0] === n);
  return e ? e[1] : (n || '—');
}

// ---- 清單頁 ----
function renderList(el) {
  const teams = ctx.allTeams();
  const activeId = ctx.activeTeam().id;
  el.innerHTML = teams.map(t => {
    const warn = t.specs.some(m => m.needsConfig);
    return `<div class="tcard ${t.id === activeId ? 'on' : ''}" data-team="${esc(t.id)}">
      <div class="head">
        <b>${esc(t.name)}</b>
        ${t.id === activeId ? '<span class="badge k">使用中</span>' : ''}
        ${t.builtin ? '<span class="badge u">內建</span>' : ''}
        ${warn ? '<span class="badge w">配置待補</span>' : ''}
        <span class="cnt">${t.specs.length}/6</span>
      </div>
      <div class="mons">${t.specs.map(m => `
        <span class="mon">${esc(zhOfSpec(m))}${typeChips(m)}</span>`).join('') ||
        '<span class="hint">（空隊伍）</span>'}</div>
      <div class="acts">
        ${t.id === activeId ? '' : `<button class="btn ghost sm" data-use="${esc(t.id)}">切換</button>`}
        <button class="btn ghost sm" data-edit="${esc(t.id)}">${t.builtin ? '複製後編輯' : '編輯'}</button>
        <button class="btn ghost sm" data-dup="${esc(t.id)}">複製</button>
        ${t.builtin ? '' : `<button class="btn ghost sm danger" data-del="${esc(t.id)}">刪除</button>`}
      </div>
    </div>`;
  }).join('') + `
    <div class="rowbtns" style="margin-top:4px">
      <button class="btn" id="tbNew">＋ 新增隊伍</button>
      <button class="btn ghost" id="tbImport">📋 貼 paste 匯入</button>
      <button class="btn ghost" id="tbRecog">📷 截圖辨識</button>
    </div>
    <div class="card" id="tbPasteBox" hidden>
      <h2>貼上 Showdown paste</h2>
      <input type="search" id="tbPasteName" placeholder="隊伍名稱（選填）" style="width:100%;margin-bottom:6px" autocomplete="off">
      <textarea id="tbPaste" placeholder="Sylveon @ Fairy Feather&#10;Ability: Pixilate&#10;EVs: 252 HP / 252 SpA / 16 Spe&#10;Modest Nature&#10;- Hyper Voice&#10;..."></textarea>
      <div class="rowbtns">
        <button class="btn" id="tbPasteGo">匯入</button>
        <button class="btn ghost" id="tbPasteCancel">取消</button>
      </div>
      <p class="hint" id="tbPasteMsg"></p>
    </div>
    <footer class="note">隊伍存在這支手機的 localStorage。內建「Meta」不能改也不能刪，要調整請按「複製後編輯」。</footer>`;

  el.querySelectorAll('[data-use]').forEach(b => b.onclick = () => { ctx.setActive(b.dataset.use); ctx.rerender(); });
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const t = ctx.allTeams().find(x => x.id === b.dataset.edit);
    if (!t) return;
    // 內建隊伍不能直接改：先複製一份可編輯的
    const id = t.builtin ? ctx.duplicate(t, `${t.name} 改`) : t.id;
    ctx.view.mode = 'edit'; ctx.view.id = id; ctx.view.open = 0;
    ctx.rerender();
  });
  el.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => {
    const t = ctx.allTeams().find(x => x.id === b.dataset.dup);
    if (t) { ctx.duplicate(t, `${t.name} 複本`); ctx.rerender(); }
  });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const t = ctx.allTeams().find(x => x.id === b.dataset.del);
    if (t && confirm(`刪除隊伍「${t.name}」？（不影響已登錄的戰績）`)) { ctx.remove(t.id); ctx.rerender(); }
  });
  el.querySelectorAll('.tcard').forEach(c => c.addEventListener('click', ev => {
    if (ev.target.closest('button')) return;
    ctx.setActive(c.dataset.team); ctx.rerender();
  }));
  el.querySelector('#tbNew').onclick = () => {
    const id = ctx.create(`新隊伍 ${ctx.teamLib.teams.length + 1}`, []);
    ctx.view.mode = 'edit'; ctx.view.id = id; ctx.view.open = -1;
    ctx.rerender();
  };
  el.querySelector('#tbRecog').onclick = () => ctx.openRecognizeTeam();
  const box = el.querySelector('#tbPasteBox');
  el.querySelector('#tbImport').onclick = () => { box.hidden = !box.hidden; if (!box.hidden) el.querySelector('#tbPaste').focus(); };
  el.querySelector('#tbPasteCancel').onclick = () => { box.hidden = true; };
  el.querySelector('#tbPasteGo').onclick = () => {
    try {
      const specs = ctx.parsePaste(el.querySelector('#tbPaste').value);
      const name = el.querySelector('#tbPasteName').value.trim() || `隊伍 ${ctx.teamLib.teams.length + 1}`;
      const r = ctx.importTeam(name, specs);
      ctx.rerender();
      const msg = el.querySelector('#tbPasteMsg');
      if (msg) msg.textContent = r.msg;
    } catch (e) {
      el.querySelector('#tbPasteMsg').textContent = '匯入失敗：' + e.message;
    }
  };
}

// ---- 編輯頁 ----
function renderEdit(el) {
  const t = ctx.allTeams().find(x => x.id === ctx.view.id);
  if (!t || t.builtin) { ctx.view.mode = 'list'; return renderList(el); }
  const v = ctx.view;
  el.innerHTML = `
    <div class="tbbar">
      <button class="btn ghost sm" id="tbBack">← 隊伍清單</button>
      <input type="text" id="tbName" value="${esc(t.name)}" aria-label="隊伍名稱">
      ${t.id === ctx.activeTeam().id ? '<span class="badge k">使用中</span>'
        : '<button class="btn ghost sm" id="tbUse">設為使用中</button>'}
    </div>
    ${t.specs.map((m, i) => slotHtml(m, i, i === v.open)).join('')}
    ${t.specs.length < 6 ? '<button class="btn ghost" id="tbAdd" style="width:100%">＋ 加入一隻</button>' : ''}
    <div class="card" style="margin-top:10px">
      <h2>匯出／匯入</h2>
      <textarea id="tbOut" readonly>${esc(ctx.toPaste(t.specs))}</textarea>
      <div class="rowbtns">
        <button class="btn ghost" id="tbCopy">複製 paste</button>
        <button class="btn ghost" id="tbReplace">用 paste 覆蓋這隊</button>
      </div>
      <p class="hint" id="tbEditMsg"></p>
    </div>
    <footer class="note">改完立刻存檔。招式／特性／道具沒有依可學表過濾（計算引擎沒帶學習表），
      請自行確認合法性；傷害計算一律 Lv50、IV31。</footer>`;

  el.querySelector('#tbBack').onclick = () => { v.mode = 'list'; ctx.rerender(); };
  const useBtn = el.querySelector('#tbUse');
  if (useBtn) useBtn.onclick = () => { ctx.setActive(t.id); ctx.rerender(); };
  const nameEl = el.querySelector('#tbName');
  nameEl.onchange = () => { t.name = nameEl.value.trim() || t.name; ctx.save(); ctx.rerender(); };
  const addBtn = el.querySelector('#tbAdd');
  if (addBtn) addBtn.onclick = () => {
    t.specs.push({ name: 'Pikachu', zh: ctx.zhByName.get('Pikachu') || 'Pikachu', evs: {}, moves: [] });
    v.open = t.specs.length - 1;
    ctx.save(); ctx.rerender();
  };
  el.querySelector('#tbCopy').onclick = async () => {
    const msg = el.querySelector('#tbEditMsg');
    try { await navigator.clipboard.writeText(ctx.toPaste(t.specs)); msg.textContent = '已複製到剪貼簿'; }
    catch (e) { msg.textContent = '複製失敗，請手動選取上面的文字'; }
  };
  el.querySelector('#tbReplace').onclick = () => {
    const box = el.querySelector('#tbOut');
    const msg = el.querySelector('#tbEditMsg');
    box.readOnly = false;
    try {
      const specs = ctx.parsePaste(box.value);
      t.specs = specs;
      ctx.save(); ctx.rerender();
    } catch (e) { msg.textContent = '覆蓋失敗：' + e.message + '（可直接在上面編輯後再按一次）'; }
  };
  wireSlots(el, t);
}

function slotHtml(m, i, open) {
  const moves = (m.moves || []).slice(0, 4);
  const ev = EV_ORDER.map(k => (m.evs && m.evs[k]) || 0);
  const evText = EV_ORDER.map((k, j) => ev[j] ? `${STAT_ZH[k]} ${ev[j]}` : null).filter(Boolean).join(' / ') || '無';
  if (!open) {
    return `<div class="slot" data-slot="${i}">
      <div class="shead" data-open="${i}">
        <span class="idx">${i + 1}</span>
        <b>${esc(zhOfSpec(m))}</b>${typeChips(m)}
        ${m.needsConfig ? '<span class="badge w">待補</span>' : ''}
        <span class="chev">▾</span>
      </div>
      <div class="sline">${esc(itemZh(m.item) || '無道具')} · ${esc(abilityZh(m.ability) || '無特性')} · ${esc(natureZh(m.nature))}</div>
      <div class="sline dim">${moves.length ? moves.map(x => esc(moveZh(x))).join('、') : '（沒有招式）'}</div>
      <div class="sline dim">${esc(evText)}</div>
    </div>`;
  }
  const evSum = ev.reduce((a, b) => a + b, 0);
  const spSum = ev.reduce((a, b) => a + spOf(b), 0);
  const over = spSum > SP_BUDGET;
  return `<div class="slot open" data-slot="${i}">
    <div class="shead" data-open="${i}">
      <span class="idx">${i + 1}</span>
      <b>${esc(zhOfSpec(m))}</b>${typeChips(m)}
      <span class="chev">▴</span>
    </div>
    <div class="sbody">
      ${fieldHtml('species', i, zhOfSpec(m), '寶可夢')}
      ${fieldHtml('item', i, itemZh(m.item), '道具')}
      ${fieldHtml('ability', i, abilityZh(m.ability), '特性')}
      <label class="fld"><span>性格</span>
        <select data-nature="${i}">
          <option value="">—</option>
          ${NATURES.map(([en, zh]) => `<option value="${en}" ${m.nature === en ? 'selected' : ''}>${zh}（${en}）</option>`).join('')}
        </select>
      </label>
      <div class="evbox">
        <div class="evhead">努力值　已用 <b class="${over ? 'over' : ''}">${spSum}</b> / ${SP_BUDGET} 點（EV ${evSum}）
          ${over ? '<span class="over">· 超過推估上限</span>' : ''}</div>
        ${EV_ORDER.map((k, j) => `
          <div class="evrow">
            <span class="evname">${STAT_ZH[k]}</span>
            <input type="range" min="0" max="${EV_STAT_MAX}" step="${EV_PER_SP}" value="${ev[j]}" data-ev="${i}" data-stat="${k}">
            <input type="number" min="0" max="${EV_STAT_MAX}" step="${EV_PER_SP}" value="${ev[j]}" data-evn="${i}" data-stat="${k}">
            <span class="evsp">${ev[j] ? spOf(ev[j]) + '點' : '—'}</span>
          </div>`).join('')}
        <p class="hint" style="margin:4px 0 0">遊戲畫面顯示的是 SP 點數（每項 0–32），這裡同時顯示 EV＝點數×8。</p>
      </div>
      <div class="mvbox">
        ${[0, 1, 2, 3].map(j => fieldHtml('move', i, moveZh(moves[j] || ''), `招式 ${j + 1}`, j)).join('')}
      </div>
      <div class="rowbtns">
        <button class="btn ghost sm danger" data-rmmon="${i}">刪除這隻</button>
      </div>
    </div>
  </div>`;
}

// 可搜尋欄位：唯讀輸入框＋點開的候選清單（一次只開一個）
function fieldHtml(kind, slot, value, label, mv) {
  const key = `${kind}:${slot}:${mv == null ? '' : mv}`;
  const openNow = ctx.view.pick === key;
  return `<div class="fld">
    <span>${esc(label)}</span>
    <button class="fldbtn ${openNow ? 'on' : ''}" data-pick="${esc(key)}">${esc(value || '—')}</button>
    ${openNow ? `<div class="picker">
      <input type="search" id="tbPickQ" placeholder="搜尋中文／英文" autocomplete="off">
      <div class="results" id="tbPickR"></div>
    </div>` : ''}
  </div>`;
}

function wireSlots(el, t) {
  const v = ctx.view;
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
    v.open = v.open === +b.dataset.open ? -1 : +b.dataset.open;
    v.pick = null;
    ctx.rerender();
  });
  el.querySelectorAll('[data-rmmon]').forEach(b => b.onclick = () => {
    t.specs.splice(+b.dataset.rmmon, 1);
    v.open = -1; ctx.save(); ctx.rerender();
  });
  el.querySelectorAll('[data-nature]').forEach(s => s.onchange = () => {
    t.specs[+s.dataset.nature].nature = s.value || undefined;
    ctx.save(); ctx.rerender();
  });
  const setEv = (i, stat, val) => {
    const m = t.specs[i];
    m.evs = m.evs || {};
    // 只夾單項上限（32 點＝252）；總量超了只在畫面提示，不改使用者填的數字
    let n = Math.max(0, Math.min(EV_STAT_MAX, Math.round((+val || 0) / EV_PER_SP) * EV_PER_SP));
    if (n > EV_STAT_MAX - EV_PER_SP) n = EV_STAT_MAX; // 248 以上直接給滿 252
    if (n) m.evs[stat] = n; else delete m.evs[stat];
    ctx.save(); ctx.rerender();
  };
  el.querySelectorAll('[data-ev]').forEach(r => r.onchange = () => setEv(+r.dataset.ev, r.dataset.stat, r.value));
  el.querySelectorAll('[data-evn]').forEach(r => r.onchange = () => setEv(+r.dataset.evn, r.dataset.stat, r.value));
  el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    v.pick = v.pick === b.dataset.pick ? null : b.dataset.pick;
    ctx.rerender();
  });
  if (v.pick) wirePicker(el, t);
}

function wirePicker(el, t) {
  const [kind, slotS, mvS] = ctx.view.pick.split(':');
  const slot = +slotS, mv = mvS === '' ? null : +mvS;
  const q = el.querySelector('#tbPickQ'), r = el.querySelector('#tbPickR');
  if (!q || !r) return;
  const draw = () => {
    const s = q.value;
    let rows;
    if (kind === 'species') {
      rows = ctx.searchSpecies(s).map(e => ({ name: e.n, zh: e.zh }));
      if (!s.trim()) rows = [];
    } else {
      rows = pick(kind === 'item' ? 'items' : kind === 'ability' ? 'abilities' : 'moves', s);
    }
    r.innerHTML = rows.map(e => `<div class="result" data-val="${esc(e.name)}">
        <span class="zh">${esc(e.zh)}</span><span class="en">${esc(e.name)}</span></div>`).join('')
      + (rows.length ? '' : '<p class="hint">找不到</p>')
      // 清空放最後：放最前面搜尋完第一列就是它，很容易誤點
      + (kind === 'species' ? '' : '<div class="result none" data-none="1"><span class="zh">（清空這格）</span></div>');
  };
  q.oninput = draw;
  draw();
  r.onclick = ev => {
    const none = ev.target.closest('[data-none]');
    const hit = ev.target.closest('[data-val]');
    if (!none && !hit) return;
    const val = none ? '' : hit.dataset.val;
    const m = t.specs[slot];
    if (kind === 'species' && val) {
      const sp = ctx.getSpecies(val);
      if (sp) { m.name = sp.name; m.zh = ctx.zhByName.get(sp.name) || sp.name; delete m.mega; }
    } else if (kind === 'item') {
      m.item = val || undefined;
      ctx.applyMega(m); // Mega 石換掉要跟著更新型態
    } else if (kind === 'ability') {
      m.ability = val || undefined;
    } else if (kind === 'move') {
      m.moves = m.moves || [];
      while (m.moves.length < 4) m.moves.push('');
      m.moves[mv] = val;
      m.moves = m.moves.filter(Boolean);
    }
    if (m.needsConfig && (m.moves || []).length && m.ability && m.nature) delete m.needsConfig;
    ctx.view.pick = null;
    ctx.save(); ctx.rerender();
  };
  q.focus();
}

export function renderTeamTab(el) {
  if (ctx.view.mode === 'edit') renderEdit(el); else renderList(el);
}
