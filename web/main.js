// Champions 對戰工具 主程式（純瀏覽器端，零使用成本）
import searchIndex from '../data/search-index.json';
import defaultTeam from '../data/my-team.js';
import threats from '../data/threats.js';
import { makeField, speedInfo, attackTable, incomingTable, getSpecies, toID } from './calc-core.js';
import { recommend } from './recommend.js';
import { initRecognize, openRecognize } from './recognize.js';

const LS_TEAM = 'pct.team.v1';       // 舊版單隊格式（只用於遷移）
const LS_TEAMS = 'pct.teams.v1';     // 隊伍庫：{ active, teams:[{id,name,specs}] }
const LS_STATE = 'pct.state.v1';
const LS_REC = 'pct.records.v1';
const BUILTIN_ID = 'builtin';

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
  twMine: false, twFoe: false, trickRoom: false, speBench: true,
  foes: [], // [{name(calc名), zh, unknown?, ...threatSpec}]
};
try {
  const saved = JSON.parse(localStorage.getItem(LS_STATE) || 'null');
  if (saved) state = { ...state, ...saved };
} catch (e) { /* ignore */ }

// ---- 隊伍庫（多隊：命名/切換/覆蓋/刪除；內建 Meta 永遠在第一位） ----
let teamLib = { active: BUILTIN_ID, teams: [] };
try {
  const t = JSON.parse(localStorage.getItem(LS_TEAMS) || 'null');
  if (t && Array.isArray(t.teams)) {
    teamLib = { active: t.active || BUILTIN_ID, teams: t.teams };
  } else {
    // 舊版單隊格式遷移成隊伍庫
    const old = JSON.parse(localStorage.getItem(LS_TEAM) || 'null');
    if (Array.isArray(old) && old.length) {
      teamLib = { active: 'migrated', teams: [{ id: 'migrated', name: '匯入的隊伍', specs: old }] };
      saveTeams();
    }
  }
} catch (e) { /* ignore */ }
function saveTeams() { localStorage.setItem(LS_TEAMS, JSON.stringify(teamLib)); }
function allTeams() {
  return [{ id: BUILTIN_ID, name: 'Meta', specs: defaultTeam, builtin: true }, ...teamLib.teams];
}
function activeTeam() { return allTeams().find(t => t.id === teamLib.active) || allTeams()[0]; }
let team = activeTeam().specs;

// URL 參數（M3）：?foes=garchomp,primarina&mode=singles&weather=Sun
// 截圖貼給 Claude 辨識後回傳的預填連結，點開直接跳推薦頁
const params = new URLSearchParams(location.search);
let urlMisses = [];
if (params.get('foes')) {
  const names = params.get('foes').split(',').map(s => s.trim()).filter(Boolean);
  const foes = [];
  for (const n of names) {
    const foe = makeFoe(n);
    if (!foe) { urlMisses.push(n); continue; }
    if (!foes.some(f => f.name === foe.name && f.mega === foe.mega)) foes.push(foe);
  }
  state.foes = foes.slice(0, 6);
  state.tab = state.foes.length && !urlMisses.length ? 'reco' : 'foes';
}
if (params.get('mode') === 'singles') state.doubles = false;
if (params.get('mode') === 'doubles') state.doubles = true;
const wParam = params.get('weather');
if (['Sun', 'Rain', 'Sand', 'Snow', ''].includes(wParam)) state.weather = wParam;
// 參數只在開啟當下生效一次；清掉 query，之後重新整理不會蓋掉使用者的編輯
if ([...params.keys()].length) history.replaceState(null, '', location.pathname);

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
  const { tab, doubles, weather, twMine, twFoe, trickRoom, speBench, foes } = state;
  localStorage.setItem(LS_STATE, JSON.stringify({ tab, doubles, weather, twMine, twFoe, trickRoom, speBench, foes }));
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
  const tn = activeTeam().name;
  $('#teamBtn').textContent = '隊伍：' + (tn.length > 7 ? tn.slice(0, 6) + '…' : tn);
  main.innerHTML = '';
  ({ foes: renderFoes, reco: renderReco, speed: renderSpeed, dmg: renderDmg, rec: renderRec })[state.tab]();
  save();
}

function foeChips(removable) {
  if (!state.foes.length) return '<p class="hint">尚未選擇對手</p>';
  return '<div class="chips">' + state.foes.map((f, i) =>
    `<span class="chip ${f.unknown ? 'unknown' : 'known'}">${esc(f.zh)}${removable ? ` <span class="x" data-rm="${i}">✕</span>` : ''}</span>`
  ).join('') + '</div>';
}

function renderFoes() {
  const missNote = urlMisses.length
    ? `<p class="hint" style="color:var(--foe)">⚠ 連結帶入失敗（查無此名）：${esc(urlMisses.join('、'))}，請手動搜尋補上。</p>`
    : '';
  const card = h(`<div>
    <div class="card">
      <h2>對手 ${state.foes.length}/6</h2>
      ${foeChips(true)}
      ${missNote}
    </div>
    <div class="card">
      <input type="search" id="q" placeholder="搜尋：中文／注音頭字（ㄌㄧㄌ）／英文" style="width:100%" autocomplete="off">
      <div class="results" id="results"></div>
      <p class="hint">實線框＝威脅庫已知配置（推估標註）；虛線框＝未知，以極限值區間估算。</p>
      <div class="rowbtns" style="margin-top:6px"><button class="btn ghost" id="recogBtn">📷 截圖辨識（實驗）</button></div>
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
  $('#recogBtn').onclick = () => openRecognize();
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
  const modeZh = state.doubles ? '雙打' : '單打';
  const card = h(`<div><div class="card">
    <div class="toggles">
      <button class="tgl ${state.twMine ? 'on' : ''}" id="twM">我方順風</button>
      <button class="tgl ${state.twFoe ? 'on' : ''}" id="twF">對方順風</button>
      <button class="tgl ${state.trickRoom ? 'on' : ''}" id="tr">戲法空間</button>
      <button class="tgl ${state.speBench ? 'on' : ''}" id="bm">${modeZh}常見線</button>
    </div>
    <div id="spelist"></div>
    <p class="hint">未知對手顯示「最慢~最快(+圍巾)」區間；${state.trickRoom ? '戲法空間中：由慢到快行動' : '由快到慢行動'}。天氣加成（葉綠素等）依上方天氣設定。
    ⚠＝與我方同速。灰底「${state.doubles ? '雙' : '單'}／單雙」＝威脅庫${modeZh}常見配置參考線（含圍巾/天氣，不套順風），切換上方單雙打會跟著換。</p>
  </div></div>`);
  main.append(...card.children);
  $('#twM').onclick = () => { state.twMine = !state.twMine; render(); };
  $('#twF').onclick = () => { state.twFoe = !state.twFoe; render(); };
  $('#tr').onclick = () => { state.trickRoom = !state.trickRoom; render(); };
  $('#bm').onclick = () => { state.speBench = !state.speBench; render(); };

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
  if (state.speBench) {
    const mode = state.doubles ? 'doubles' : 'singles';
    const foeIds = new Set(state.foes.map(f => toID(f.mega || f.name)));
    for (const t of threats) {
      if (!t.modes || !t.modes.includes(mode)) continue;
      if (foeIds.has(toID(t.mega || t.name))) continue; // 已選成本場對手 → 用對手列就好
      const si = speedInfo(t, { weather: state.weather || undefined });
      if (!si || si.unknown) continue;
      rows.push({ side: 'bench', zh: t.zh, spe: si.spe, sortKey: si.spe, mods: si.mods,
        tag: t.modes.length > 1 ? '單雙' : (mode === 'doubles' ? '雙' : '單') });
    }
  }
  rows.sort((a, b) => state.trickRoom ? a.sortKey - b.sortKey : b.sortKey - a.sortKey);
  // 同速只標「我方 ↔ 對手/常見線」：對手之間或常見線之間同速與行動順序決策無關
  const mineSpe = new Set(), otherSpe = new Set();
  rows.forEach(r => { if (!r.unknown) (r.side === 'mine' ? mineSpe : otherSpe).add(r.spe); });
  $('#spelist').innerHTML = rows.map(r => {
    const same = !r.unknown && (r.side === 'mine' ? otherSpe.has(r.spe) : mineSpe.has(r.spe));
    const name = r.side === 'bench'
      ? `<span>${esc(r.zh)}</span><span class="sbadge b">${r.tag}</span>`
      : `<span class="${r.side === 'mine' ? 'mine' : 'foename'}">${esc(r.zh)}</span><span class="sbadge ${r.side === 'mine' ? 'm' : 'f'}">${r.side === 'mine' ? '我方' : '對手'}</span>`;
    const mods = r.mods && r.mods.length ? `<span class="mod">${esc(r.mods.join(' '))}</span>` : '';
    const val = r.unknown
      ? `<span class="val">${r.min}~${r.max}<span class="mod">(巾${r.scarfMax})</span></span>`
      : `<span class="val">${r.spe}${same ? ' ⚠同速' : ''}</span>`;
    return `<div class="spebar ${same ? 'same' : ''}${r.side === 'bench' ? ' bench' : ''}">${name}${mods}${val}</div>`;
  }).join('') || '<p class="hint">選擇對手或開啟常見線後顯示速度線</p>';
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

// ---- 戰績紀錄（localStorage＋匯出 CSV，不做後端） ----
let records = [];
try {
  const r = JSON.parse(localStorage.getItem(LS_REC) || '[]');
  if (Array.isArray(r)) records = r;
} catch (e) { /* ignore */ }
function saveRec() { localStorage.setItem(LS_REC, JSON.stringify(records)); }

function addRecord(result) {
  records.unshift({
    ts: Date.now(),
    mode: state.doubles ? '雙打' : '單打',
    weather: state.weather || '',
    team: activeTeam().name,
    result, // 'W' | 'L'
    foes: state.foes.map(f => f.zh),
    note: ($('#recNote') ? $('#recNote').value.trim() : ''),
  });
  saveRec();
  render();
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function csvCell(s) {
  s = '' + (s == null ? '' : s);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const head = ['時間', '模式', '天氣', '隊伍', '結果', '對手1', '對手2', '對手3', '對手4', '對手5', '對手6', '備註'];
  const lines = records.map(r => {
    const foes = (r.foes || []).slice(0, 6);
    while (foes.length < 6) foes.push('');
    return [fmtTime(r.ts), r.mode, r.weather, r.team || '', r.result === 'W' ? '勝' : '敗', ...foes, r.note || ''].map(csvCell).join(',');
  });
  // BOM 讓 Excel 正確辨識 UTF-8 中文
  const blob = new Blob(['\ufeff' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `champions-records-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function recStats(list) {
  const w = list.filter(r => r.result === 'W').length;
  const l = list.length - w;
  const rate = list.length ? Math.round(w / list.length * 100) : 0;
  return { w, l, rate, n: list.length };
}

function renderRec() {
  const all = recStats(records);
  const dbl = recStats(records.filter(r => r.mode === '雙打'));
  const sgl = recStats(records.filter(r => r.mode === '單打'));
  const foesTxt = state.foes.length ? state.foes.map(f => f.zh).join('、') : '';
  const wrap = h(`<div>
    <div class="card">
      <h2>登錄這場（${esc(activeTeam().name)}・${state.doubles ? '雙打' : '單打'}${state.weather ? '・' + ({ Sun: '晴', Rain: '雨', Sand: '沙', Snow: '雪' }[state.weather] || state.weather) : ''}）</h2>
      <p class="hint">${foesTxt ? '對手：' + esc(foesTxt) : '尚未選對手（也可以直接登錄，不記對手）'}</p>
      <input type="search" id="recNote" placeholder="備註（選填，例：被戲法空間翻盤）" style="width:100%;margin:6px 0" autocomplete="off">
      <div class="rowbtns">
        <button class="btn" id="recW" style="background:var(--mine)">✓ 勝</button>
        <button class="btn" id="recL" style="background:var(--foe)">✗ 敗</button>
      </div>
    </div>
    <div class="card">
      <h2>統計</h2>
      <div class="statrow">
        <span>總計 <b>${all.w}勝${all.l}敗</b>（${all.rate}%）</span>
        ${dbl.n ? `<span>雙打 <b>${dbl.w}–${dbl.l}</b>（${dbl.rate}%）</span>` : ''}
        ${sgl.n ? `<span>單打 <b>${sgl.w}–${sgl.l}</b>（${sgl.rate}%）</span>` : ''}
      </div>
    </div>
    <div class="card">
      <h2>歷史（${records.length} 場）</h2>
      <div id="recList">${records.map((r, i) => `
        <div class="recrow">
          <div class="top">
            <span class="wl ${r.result}">${r.result === 'W' ? '勝' : '敗'}</span>
            <span>${r.team ? esc(r.team) + '・' : ''}${esc(r.mode)}${r.weather ? '・' + ({ Sun: '晴', Rain: '雨', Sand: '沙', Snow: '雪' }[r.weather] || esc(r.weather)) : ''}</span>
            <span class="time">${fmtTime(r.ts)}</span>
            <span class="x" data-del="${i}">✕</span>
          </div>
          ${r.foes && r.foes.length ? `<div class="foes">vs ${esc(r.foes.join('、'))}</div>` : ''}
          ${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}
        </div>`).join('') || '<p class="hint">還沒有紀錄，打完一場按上面的勝／敗登錄。</p>'}</div>
      ${records.length ? `<div class="rowbtns" style="margin-top:10px"><button class="btn ghost" id="recCsv">匯出 CSV</button></div>` : ''}
    </div>
    <footer class="note">紀錄存在這支手機的 localStorage；換手機或清瀏覽器資料前先匯出 CSV 備份。</footer>
  </div>`);
  main.append(...wrap.children);
  $('#recW').onclick = () => addRecord('W');
  $('#recL').onclick = () => addRecord('L');
  const csvBtn = $('#recCsv');
  if (csvBtn) csvBtn.onclick = exportCsv;
  $('#recList').addEventListener('click', ev => {
    const el = ev.target.closest('[data-del]');
    if (!el) return;
    records.splice(+el.dataset.del, 1);
    saveRec();
    render();
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
  if (b) { state.tab = b.dataset.tab; urlMisses = []; render(); }
});
$('#modeSeg').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-v]');
  if (b) { state.doubles = b.dataset.v === 'doubles'; render(); }
});
$('#weatherSel').addEventListener('change', ev => { state.weather = ev.target.value; render(); });

const dlg = $('#teamDlg');
function renderTeamDlg(msg) {
  const at = activeTeam();
  $('#teamList').innerHTML = allTeams().map(t => `
    <div class="teamrow ${t.id === at.id ? 'sel' : ''}" data-sel="${esc(t.id)}">
      <div class="info">
        <span class="name">${t.id === at.id ? '✓ ' : ''}${esc(t.name)}${t.builtin ? '<span class="badge u">內建</span>' : ''}</span>
        <span class="cnt">${esc(t.specs.map(teamZh).join('、'))}</span>
      </div>
      ${t.builtin ? '' : `<span class="x" data-delteam="${esc(t.id)}">✕</span>`}
    </div>`).join('');
  $('#teamMsg').textContent = msg || '';
}
$('#teamBtn').onclick = () => { renderTeamDlg(); dlg.showModal(); };
$('#teamClose').onclick = () => dlg.close();
$('#teamList').addEventListener('click', ev => {
  const del = ev.target.closest('[data-delteam]');
  if (del) {
    const t = teamLib.teams.find(x => x.id === del.dataset.delteam);
    if (t && confirm(`刪除隊伍「${t.name}」？（不影響已登錄的戰績）`)) {
      teamLib.teams = teamLib.teams.filter(x => x.id !== t.id);
      if (teamLib.active === t.id) teamLib.active = BUILTIN_ID;
      saveTeams(); team = activeTeam().specs;
      renderTeamDlg(`已刪除「${t.name}」`); render();
    }
    return;
  }
  const sel = ev.target.closest('[data-sel]');
  if (sel && sel.dataset.sel !== teamLib.active) {
    teamLib.active = sel.dataset.sel;
    saveTeams(); team = activeTeam().specs;
    renderTeamDlg(`已切換：${activeTeam().name}`); render();
  }
});
$('#teamShow').onclick = () => {
  $('#teamName').value = activeTeam().name;
  $('#teamPaste').value = toPaste(team);
  $('#teamMsg').textContent = '已帶出目前隊伍，可修改後按「覆蓋目前隊伍」或「存成新隊伍」。';
};
$('#teamImport').onclick = () => {
  try {
    const specs = parsePaste($('#teamPaste').value);
    const name = $('#teamName').value.trim() || `隊伍 ${teamLib.teams.length + 1}`;
    const id = 't' + Date.now().toString(36);
    teamLib.teams.push({ id, name, specs });
    teamLib.active = id;
    saveTeams(); team = specs;
    $('#teamName').value = ''; $('#teamPaste').value = '';
    renderTeamDlg(`已存成新隊伍並切換：${name}（${specs.length} 隻）`); render();
  } catch (e) {
    $('#teamMsg').textContent = '匯入失敗：' + e.message;
  }
};
$('#teamUpdate').onclick = () => {
  const at = activeTeam();
  if (at.builtin) { $('#teamMsg').textContent = '內建隊伍 Meta 不能覆蓋，請改用「存成新隊伍」。'; return; }
  try {
    const specs = parsePaste($('#teamPaste').value);
    at.specs = specs;
    const name = $('#teamName').value.trim();
    if (name) at.name = name;
    saveTeams(); team = specs;
    renderTeamDlg(`已覆蓋：${at.name}（${specs.length} 隻）`); render();
  } catch (e) {
    $('#teamMsg').textContent = '覆蓋失敗：' + e.message;
  }
};

// ---- 截圖辨識（M4）----
initRecognize({
  zhOf: n => zhByName.get(n) || n,
  onAdd: n => {
    if (state.foes.length >= 6) return false;
    const foe = makeFoe(n);
    if (!foe || state.foes.some(f => f.name === foe.name && f.mega === foe.mega)) return false;
    state.foes.push(foe);
    save();
    return true;
  },
  pickedHtml: () => foeChips(false),
  onClose: () => { state.tab = 'foes'; render(); },
});
// PWA Share Target 進來的截圖（sw.js 存進 cache 後重導 ?shared=1）
if (params.get('shared')) {
  (async () => {
    let blob = null;
    try {
      const c = await caches.open('pct-shared');
      const hit = await c.match('./shared-screenshot');
      if (hit) { blob = await hit.blob(); await c.delete('./shared-screenshot'); }
    } catch (e) { /* 沒有就開空的辨識頁 */ }
    openRecognize(blob);
  })();
}

render();

// ---- PWA ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 離線功能失敗不影響使用 */ });
}
