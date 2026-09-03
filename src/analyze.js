// 對戰分析：我的隊伍 vs 熱門威脅
// 引擎：@smogon/calc（Gen 9 機制）；Mega 噴火龍 Y 以 @pkmn/dex 種族值 override
// 假設：Lv50、IV31、晴天（我方噴火龍 Mega 後的常態場地）、雙打規則（單打時範圍招不打折）
const { calculate, Pokemon, Move, Field, Generations } = require('@smogon/calc');
const { Dex } = require('@pkmn/dex');
const myTeam = require('../data/my-team');
const threats = require('../data/threats');
const fs = require('fs');
const path = require('path');

const gen = Generations.get(9);

function makeMon(spec) {
  const opts = {
    item: spec.item,
    ability: spec.ability,
    nature: spec.nature,
    evs: spec.evs,
    level: 50,
  };
  if (spec.mega) {
    const mega = Dex.species.get(spec.mega);
    opts.overrides = {
      baseStats: { ...mega.baseStats },
      types: [...mega.types],
    };
    if (spec.ability === 'Blaze') opts.ability = 'Drought'; // Mega Y 後特性
    opts.item = undefined; // Mega 石不參與傷害修正
  }
  return new Pokemon(gen, spec.name, opts);
}

const field = new Field({
  gameType: 'Doubles',
  weather: 'Sun',
});

const STATUS_MOVES = new Set(['Yawn', 'Detect', 'Toxic', 'Wide Guard', 'Baneful Bunker',
  'Parting Shot', 'Protect', 'Swords Dance', 'Haze', 'Tailwind', 'Encore', 'Light Screen',
  'Trick Room', 'Life Dew']);

function calcAttack(attSpec, defSpec) {
  const results = [];
  for (const mv of attSpec.moves) {
    if (STATUS_MOVES.has(mv)) continue;
    const attacker = makeMon(attSpec);
    const defender = makeMon(defSpec);
    const move = new Move(gen, mv);
    let r;
    try {
      r = calculate(gen, attacker, defender, move, field);
    } catch (e) {
      console.error(`calc failed: ${attSpec.name} ${mv} vs ${defSpec.name}: ${e.message}`);
      continue;
    }
    const dmg = Array.isArray(r.damage) ? r.damage : [r.damage];
    const flat = dmg.flat();
    const min = Math.min(...flat), max = Math.max(...flat);
    const hp = defender.maxHP();
    let ko = '';
    try { ko = r.koChance().text; } catch (e) { ko = ''; }
    results.push({
      move: mv,
      min, max,
      minPct: +(min / hp * 100).toFixed(1),
      maxPct: +(max / hp * 100).toFixed(1),
      ko,
      desc: (() => { try { return r.moveDesc(); } catch (e) { return ''; } })(),
    });
  }
  results.sort((a, b) => b.maxPct - a.maxPct);
  return results;
}

// ---- 速度線 ----
function speedOf(spec) {
  const p = makeMon(spec);
  return p.rawStats.spe;
}
const speeds = [];
for (const m of myTeam) {
  const s = speedOf(m);
  const entry = { zh: m.zh, name: m.name, side: 'mine', spe: s, mods: [] };
  if (m.item === 'Choice Scarf') entry.mods.push({ label: '圍巾×1.5', value: Math.floor(s * 1.5) });
  if (m.ability === 'Chlorophyll') entry.mods.push({ label: '晴天葉綠素×2', value: s * 2 });
  speeds.push(entry);
}
const seenThreat = new Set();
for (const t of threats) {
  const key = t.name + (t.mega || '');
  if (seenThreat.has(key)) continue;
  seenThreat.add(key);
  const s = speedOf(t);
  const entry = { zh: t.zh, name: t.name, side: 'theirs', spe: s, mods: [] };
  if (t.scarf || t.item === 'Choice Scarf') entry.mods.push({ label: '圍巾×1.5', value: Math.floor(s * 1.5) });
  speeds.push(entry);
}
speeds.sort((a, b) => b.spe - a.spe);

// ---- 對點計算 ----
const matchups = threats.map(t => {
  const myAttacks = [];
  for (const m of myTeam) {
    for (const r of calcAttack(m, t)) {
      myAttacks.push({ attacker: m.zh, attackerEn: m.name, ...r });
    }
  }
  myAttacks.sort((a, b) => b.maxPct - a.maxPct);

  const theirAttacks = [];
  for (const m of myTeam) {
    const rs = calcAttack(t, m);
    if (rs.length) {
      theirAttacks.push({ defender: m.zh, defenderEn: m.name, best: rs[0], all: rs });
    }
  }
  // 依「對我方最痛」排序
  theirAttacks.sort((a, b) => b.best.maxPct - a.best.maxPct);

  return {
    zh: t.zh, name: t.name, rank: t.rank, item: t.item, ability: t.ability,
    nature: t.nature, evs: t.evs, moves: t.moves, mega: t.mega || null,
    myAttacks: myAttacks.slice(0, 6),
    theirAttacks,
  };
});

const out = {
  generatedAt: new Date().toISOString(),
  season: 'Season 5（Regulation M-B）',
  assumptions: 'Lv50、IV31、晴天、雙打規則（範圍招×0.75）；對手配置為常見標準配置推估',
  speeds,
  matchups,
};
const outPath = path.join(__dirname, '../out/analysis.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('written', outPath, 'matchups:', matchups.length, 'speeds:', speeds.length);
