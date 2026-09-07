// Champions 對戰工具 主程式（純瀏覽器端，零使用成本）
import searchIndex from '../data/search-index.json';
import defaultTeam from '../data/my-team.js';
import threats from '../data/threats.js';
import { makeField, speedInfo, attackTable, incomingTable, getSpecies, toID } from './calc-core.js';
import { recommend } from './recommend.js';

const LS_TEAM = 'pct.team.v1';
const LS_STATE = 'pct.state.v1';

// 威脅庫：calc 名稱(toID) → spec（同種多套取第一套）
const threatById = new Map();
for (const t of threats) {
  const id = toID(t.mega || t.name);
  if (!threatById.has(id)) threatById.set(id, t);
  const baseId = toID(t.name);
  if (!threatById.has(baseId)) threatById.set(baseId, t);
}
const zhByName = new Map(searchIndex.map(e => [e.n, e.zh]));

// ---- 狀態 ----
let state = {
  tab: 'foes',
  doubles: true,
  weather: '',
  twMine: false, twFoe: false, trickRoom: false,
  foes: [], // [{name(calc名), zh, unknown?, ...threatSpec}]
};
try {
  const saved = JSON.parse(localStorage.getItem(LS_STATE) || 'null');
  if (saved) state = { ...state, ...saved };
} catch (e) { /* ignore */ }

let team = defaultTeam;
try {
  const t = JSON.parse(localStorage.getItem(LS_TEAM) || 'null');
  if (Array.isArray(t) && t.length) team = t;
} catch (e) { /* ignore */ }

// URL 參數（M3 預埋）：?foes=garchomp,primarina&mode=singles
const params = new URLSearchParams(location.search);
if (params.get('foes')) {
  state.foes = params.get('foes').split(',').map(s => makeFoe(s.trim())).filter(Boolean).slice(0, 6);
  state.tab = state.foes.length ? 'reco' : 'foes';
}
if (params.get('mode') === 'singles') state.doubles = false;
if (params.get('mode') === 'doubles') state.doubles = true;

function makeFoe(idOrName) {
  const id = toID(idOrName);
  const entry = searchIndex.find(e => toID(e.n) === id);
  if (!entry) return null;
  return foeFromEntry(entry);
}
function foeFromEntry(entry) {
  const t = threatById.get(toID(entry.n));
  if (t) return { ...t, zh: entry.zh, known: true };
  return { name: entry.n, zh: entry.zh, unknown: true };
}

function save() {
  const { tab, doubles, weather, twMine, twFoe, trickRoom, foes } = state;
  localStorage.setItem(LS_STATE, JSON.stringify({ tab, doubles, weather, twMine, twFoe, trickRoom, foes }));
}

// ---- 小工具 ----
const $ = s => document.querySelector(s);
function h(html) { const d = document.createElement('div'); d.innerHTML = html; return d; }
function esc(s) { return ('' + s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toHalf(s) { return s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)); }
function fieldNow() { return makeField({ doubles: state.doubles, weather: state.weather || undefined }); }
function teamZh(m) { return m.zh || zhByName.get(m.mega || m.name) || m.name; }

// ---- 搜尋 ----
function search(qRaw) {
  const q = toHalf(qRaw.trim()).toLowerCase();
  if (!q) return [];
  const hasCJK = /[一-鿿]/.test(q);
  const hasZY = /[ㄅ-ㄯ]/.test(q);
  const scored = [];
  for (const e of searchIndex) {
    let s = -1;
    if (hasCJK) { if (e.zh.includes(qRaw.trim())) s = 10; }
    else if (hasZY) { if (e.zy.startsWith(q)) s = 10; else if (e.zy.includes(q)) s = 5; }
    else {
      const en = e.n.toLowerCase();
      if (en.startsWith(q)) s = 9;
      else if (e.py.startsWith(q)) s = 8;
      else if (en.includes(q)) s = 4;
    }
    if (s >= 0) {
      if (threatById.has(toID(e.n))) s += 3; // 威脅庫優先
      if (!e.n.includes('-')) s += 1;        // 基礎型態優先
      scored.push([s, e]);
    }
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].no - b[1].no);
  return scored.slice(0, 12).map(x => x[1]);
}

// ---- 分頁渲染 ----
const main = $('#main');
function render() {
  document.querySelectorAll('#tabbar button').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === state.tab));
  document.querySelectorAll('#modeSeg button').forEach(b =>
    b.classList.toggle('on', (b.dataset.v === 'doubles') === state.doubles));
  $('#weatherSel').value = state.weather;
  main.innerHTML = '';
  ({ foes: renderFoes, reco: renderReco, speed: renderSpeed, dmg: renderDmg })[state.tab]();
  save();
}

function foeChips(removable) {
  if (!state.foes.length) return '<p class="hint">尚未選擇對手</p>';
  return '<div class="chips">' + state.foes.map((f, i) =>
    `<span class="chip ${f.unknown ? 'unknown' : 'known'}">${esc(f.zh)}${removable ? ` <span class="x" data-rm="${i}">✕</span>` : ''}</span>`
  ).join('') + '</div>';
}

function renderFoes() {
  const card = h(`<div>
    <div class="card">
      <h2>對手 ${state.foes.length}/6</h2>
      ${foeChips(true)}
    </div>
    <div class="card">
      <input type="search" id="q" placeholder="搜尋：中文／注音頭字（ㄌㄧㄌ）／英文" style="width:100%" autocomplete="off">
      <div class="results" id="results"></div>
      <p class="hint">實線框＝威脅庫已知配置（推估標註）；虛線框＝未知，以極限值區間估算。</p>
    </div>
    ${state.foes.length ? '<button class="btn" id="goReco" style="width:100%">看推薦 →</button>' : ''}
    <footer class="note">假設 Lv50、IV31；已知配置為賽季常見配置「推估」，非對手實際數值。</footer>
  </div>`);
  main.append(...card.children);
  const q = $('#q'), results = $('#results');
  q.addEventListener('input', () => {
    const rs = search(q.value);
    results.innerHTML = rs.map(e => {
      const known = threatById.has(toID(e.n));
      return `<div class="result" data-add="${esc(e.n)}">
        <span class="zh">${esc(e.zh)}</span><span class="en">${esc(e.n)} #${e.no}</span>
        <span class="badge ${known ? 'k' : 'u'}">${known ? '已知配置' : '未知→極限值'}</span></div>`;
    }).join('') || (q.value.trim() ? '<p class="hint">找不到</p>' : '');
  });
  results.addEventListener('click', ev => {
    const el = ev.target.closest('[data-add]');
    if (!el) return;
    if (state.foes.length >= 6) return;
    const foe = makeFoe(el.dataset.add);
    if (foe && !state.foes.some(f => f.name === foe.name && f.mega === foe.mega)) {
      state.foes.push(foe);
      q.value = ''; results.innerHTML = '';
      render();
    }
  });
  main.addEventListener('click', onRemoveFoe);
  const go = $('#goReco');
  if (go) go.addEventListener('click', () => { state.tab = 'reco'; render(); });
  q.focus();
}
function onRemoveFoe(ev) {
  const rm = ev.target.closest('[data-rm]');
  if (rm) { state.foes.splice(+rm.dataset.rm, 1); render(); }
}

function renderReco() {
  if (!state.foes.length) { main.innerHTML = '<div class="empty">先到「對手」選擇對面陣容</div>'; return; }
  const { ranked, picks, leads } = recommend(team, state.foes,
    { field: fieldNow(), weather: state.weather || undefined, doubles: state.doubles });
  const pickSet = new Set(picks.map(p => p.spec));
  const leadSet = new Set(leads.map(p => p.spec));
  main.appendChild(h(`<div class="card"><h2>對面</h2>${foeChips(false)}</div>`).firstElementChild);
  const wrap = h('<div>' + ranked.map(r => `
    <div class="card reco ${pickSet.has(r.spec) ? 'pick' : ''}">
      <div class="head">
        <b>${esc(teamZh(r.spec))}</b>
        ${leadSet.has(r.spec) ? '<span class="leadtag">首發</span>' : ''}
        ${pickSet.has(r.spec) ? '<span class="badge k">帶上</span>' : '<span class="badge u">後備</span>'}
        <span class="score">${r.score}</span>
      </div>
      ${r.reasons.length ? `<ul>${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>`).join('') + '</div>');
  main.append(...wrap.children);
  main.appendChild(h(`<footer class="note">規則評分：確1 +3／亂1 +2／確2 +1；被確1 −3／被亂1 −2；速度快 +1；特性剋制另計。${state.doubles ? '首發取 2（Fake Out 優先）' : '首發取 1'}。</footer>`).firstElementChild);
}

function renderSpeed() {
  const card = h(`<div><div class="card">
    <div class="toggles">
      <button class="tgl ${state.twMine ? 'on' : ''}" id="twM">我方順風</button>
      <button class="tgl ${state.twFoe ? 'on' : ''}" id="twF">對方順風</button>
      <button class="tgl ${state.trickRoom ? 'on' : ''}" id="tr">戲法空間</button>
    </div>
    <div id="spelist"></div>
    <p class="hint">未知對手顯示「最慢~最快(+圍巾)」區間；${state.trickRoom ? '戲法空間中：由慢到快行動' : '由快到慢行動'}。天氣加成（葉綠素等）依上方天氣設定。</p>
  </div></div>`);
  main.append(...card.children);
  $('#twM').onclick = () => { state.twMine = !state.twMine; render(); };
  $('#twF').onclick = () => { state.twFoe = !state.twFoe; render(); };
  $('#tr').onclick = () => { state.trickRoom = !state.trickRoom; render(); };

  const rows = [];
  for (const m of team) {
    const si = speedInfo(m, { weather: state.weather || undefined, tailwind: state.twMine });
    if (si) rows.push({ side: 'mine', zh: teamZh(m), spe: si.spe, sortKey: si.spe, mods: si.mods });
  }
  for (const f of state.foes) {
    const si = speedInfo(f, { weather: state.weather || undefined, tailwind: state.twFoe });
    if (!si) continue;
    if (si.unknown) {
      const tw = state.twFoe ? 2 : 1;
      rows.push({ side: 'foe', zh: f.zh, unknown: true, min: si.min * tw, max: si.max * tw,
        scarfMax: si.scarfMax * tw, sortKey: si.max * tw, mods: state.twFoe ? ['順風×2'] : [] });
    } else {
      rows.push({ side: 'foe', zh: f.zh, spe: si.spe, sortKey: si.spe, mods: si.mods });
    }
  }
  rows.sort((a, b) => state.trickRoom ? a.sortKey - b.sortKey : b.sortKey - a.sortKey);
  const speCount = {};
  rows.forEach(r => { if (!r.unknown) speCount[r.spe] = (speCount[r.spe] || 0) + 1; });
  $('#spelist').innerHTML = rows.map(r => {
    const same = !r.unknown && speCount[r.spe] > 1;
    const name = `<span class="${r.side === 'mine' ? 'mine' : 'foename'}">${esc(r.zh)}</span>`;
    const mods = r.mods && r.mods.length ? `<span class="mod">${esc(r.mods.join(' '))}</span>` : '';
    const val = r.unknown
      ? `<span class="val">${r.min}~${r.max}<span class="mod">(巾${r.scarfMax})</span></span>`
      : `<span class="val">${r.spe}${same ? ' ⚠同速' : ''}</span>`;
    return `<div class="spebar ${same ? 'same' : ''}">${name}${mods}${val}</div>`;
  }).join('') || '<p class="hint">選擇對手後顯示完整速度線</p>';
}

function renderDmg() {
  if (!state.foes.length) { main.innerHTML = '<div class="empty">先到「對手」選擇對面陣容</div>'; return; }
  if (state.dmgFoe == null || state.dmgFoe >= state.foes.length) state.dmgFoe = 0;
  const tabs = `<div class="foe-tabs">${state.foes.map((f, i) =>
    `<span class="chip ${i === state.dmgFoe ? 'sel' : ''}" data-df="${i}">${esc(f.zh)}</span>`).join('')}</div>`;
  const foe = state.foes[state.dmgFoe];
  const field = fieldNow();

  let out = `<div class="group-title">我方 → <span class="foename">${esc(foe.zh)}</span>${foe.unknown ? '（極限值區間）' : ''}</div>`;
  out += `<table><tr><th>我方／招式</th><th class="num">傷害%</th><th></th></tr>`;
  for (const m of team) {
    const rows = attackTable(m, foe, field);
    if (!rows.length) continue;
    out += `<tr><td colspan="3" class="mine" style="font-weight:700">${esc(teamZh(m))}</td></tr>`;
    for (const r of rows) {
      out += `<tr><td>${esc(r.move)}</td><td class="num" ${r.detail ? `title="${esc(r.detail)}"` : ''}>${r.minPct}–${r.maxPct}</td><td><span class="tag ${r.cls}">${esc(r.tag)}</span></td></tr>`;
    }
  }
  out += `</table>`;

  out += `<div class="group-title" style="margin-top:14px"><span class="foename">${esc(foe.zh)}</span> → 我方${foe.unknown ? '（STAB 100威力極限推估）' : ''}</div>`;
  out += `<table><tr><th>我方</th><th>最痛的招</th><th class="num">傷害%</th><th></th></tr>`;
  for (const m of team) {
    const rows = incomingTable(foe, m, field);
    const w = rows[0];
    if (!w) { out += `<tr><td class="mine">${esc(teamZh(m))}</td><td colspan="3" class="hint">（無攻擊招）</td></tr>`; continue; }
    out += `<tr><td class="mine">${esc(teamZh(m))}</td><td>${esc(w.move)}</td><td class="num">${w.minPct}–${w.maxPct}</td><td><span class="tag ${w.cls}">${esc(w.tag)}</span></td></tr>`;
  }
  out += `</table>`;

  const wrap = h(`<div>${tabs}<div class="card">${out}</div>
    <footer class="note">${state.doubles ? '雙打：範圍招已×0.75' : '單打：範圍招不打折'}；天氣：${state.weather ? { Sun: '晴', Rain: '雨', Sand: '沙', Snow: '雪' }[state.weather] : '無'}。點傷害數字可看未知區間細節。</footer></div>`);
  main.append(...wrap.children);
  main.querySelector('.foe-tabs').addEventListener('click', ev => {
    const el = ev.target.closest('[data-df]');
    if (el) { state.dmgFoe = +el.dataset.df; render(); }
  });
}

// ---- Showdown paste 解析 ----
function parsePaste(text) {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const specs = [];
  for (const b of blocks) {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    const first = lines.shift();
    if (!first) continue;
    let head = first, item;
    const at = head.split(' @ ');
    if (at.length === 2) { head = at[0].trim(); item = at[1].trim(); }
    head = head.replace(/\s*\((M|F)\)\s*$/, '');
    const paren = head.match(/\(([^()]+)\)\s*$/);
    const name = paren ? paren[1].trim() : head.trim();
    const spec = { name, item, evs: {}, moves: [] };
    for (const l of lines) {
      let m;
      if ((m = l.match(/^Ability:\s*(.+)$/i))) spec.ability = m[1].trim();
      else if ((m = l.match(/^Level:\s*(\d+)$/i))) { /* 固定 Lv50 */ }
      else if ((m = l.match(/^EVs:\s*(.+)$/i))) {
        for (const part of m[1].split('/')) {
          const mm = part.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
          if (mm) spec.evs[{ hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' }[mm[2].toLowerCase()]] = +mm[1];
        }
      } else if ((m = l.match(/^(\w+)\s+Nature$/i))) spec.nature = m[1];
      else if ((m = l.match(/^-\s*(.+)$/))) spec.moves.push(m[1].trim());
    }
    if (!getSpecies(spec.name)) throw new Error(`看不懂的寶可夢名：${spec.name}`);
    // Mega 石 → 自動掛 mega 型態
    if (item && /ite Y$/.test(item)) spec.mega = `${spec.name}-Mega-Y`;
    else if (item && /ite X$/.test(item)) spec.mega = `${spec.name}-Mega-X`;
    else if (item && /ite$/.test(item) && item !== 'Eviolite' && getSpecies(`${spec.name}-Mega`)) spec.mega = `${spec.name}-Mega`;
    spec.zh = zhByName.get(spec.mega || spec.name) || zhByName.get(spec.name) || spec.name;
    specs.push(spec);
  }
  if (!specs.length) throw new Error('沒有解析到任何寶可夢');
  return specs;
}
function toPaste(specs) {
  return specs.map(s => {
    const evs = Object.entries(s.evs || {}).filter(([, v]) => v)
      .map(([k, v]) => `${v} ${{ hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' }[k]}`).join(' / ');
    return [`${s.name}${s.item ? ' @ ' + s.item : ''}`,
      s.ability ? `Ability: ${s.ability}` : null, 'Level: 50',
      evs ? `EVs: ${evs}` : null, s.nature ? `${s.nature} Nature` : null,
      ...(s.moves || []).map(m => `- ${m}`)].filter(Boolean).join('\n');
  }).join('\n\n');
}

// ---- 事件繫結 ----
$('#tabbar').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-tab]');
  if (b) { state.tab = b.dataset.tab; render(); }
});
$('#modeSeg').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-v]');
  if (b) { state.doubles = b.dataset.v === 'doubles'; render(); }
});
$('#weatherSel').addEventListener('change', ev => { state.weather = ev.target.value; render(); });

const dlg = $('#teamDlg');
$('#teamBtn').onclick = () => { $('#teamMsg').textContent = `目前隊伍：${team.map(teamZh).join('、')}`; dlg.showModal(); };
$('#teamClose').onclick = () => dlg.close();
$('#teamShow').onclick = () => { $('#teamPaste').value = toPaste(team); };
$('#teamReset').onclick = () => {
  localStorage.removeItem(LS_TEAM); team = defaultTeam;
  $('#teamMsg').textContent = '已還原內建隊伍'; render();
};
$('#teamImport').onclick = () => {
  try {
    const specs = parsePaste($('#teamPaste').value);
    team = specs;
    localStorage.setItem(LS_TEAM, JSON.stringify(specs));
    $('#teamMsg').textContent = `已匯入 ${specs.length} 隻：${specs.map(teamZh).join('、')}`;
    render();
  } catch (e) {
    $('#teamMsg').textContent = '匯入失敗：' + e.message;
  }
};

render();

// ---- PWA ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 離線功能失敗不影響使用 */ });
}
