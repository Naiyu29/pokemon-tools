// 瀏覽器端計算核心：包 @smogon/calc（Gen 9，含 Mega／各形態資料）
// 全部在本地計算，零網路、零 token 成本
import { calculate, Pokemon, Move, Field, Generations } from '@smogon/calc';

export const gen = Generations.get(9);
export const LEVEL = 50;

export function getSpecies(name) {
  return gen.species.get(toID(name));
}
export function toID(s) {
  return ('' + s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Lv50 能力值公式（IV31）
export function statAt(base, ev, plus /* 1.1 | 1 | 0.9 */, isHP) {
  const core = Math.floor((2 * base + 31 + Math.floor(ev / 4)) * LEVEL / 100);
  if (isHP) return core + LEVEL + 10;
  return Math.floor((core + 5) * plus);
}

// spec: { name, item, ability, nature, evs, moves, mega?, boosterSpe?, unknown? }
export function makeMon(spec, extra = {}) {
  let name = spec.name;
  let ability = spec.ability;
  let item = spec.item;
  if (spec.mega) {
    name = spec.mega;
    const sp = getSpecies(spec.mega);
    // 新 Mega 在 calc 資料的特性可能是佔位值，威脅庫可用 megaAbility 覆寫
    ability = spec.megaAbility || (sp && sp.abilities ? sp.abilities['0'] : ability);
    item = undefined; // Mega 石不參與傷害修正
  }
  return new Pokemon(gen, name, {
    level: LEVEL,
    item,
    ability,
    nature: spec.nature,
    evs: spec.evs,
    ...extra,
  });
}

// 未知寶可夢：極限耐久上下界
export function unknownDefenders(name) {
  const frail = new Pokemon(gen, name, { level: LEVEL, nature: 'Hardy', evs: {} });
  const bulkP = new Pokemon(gen, name, { level: LEVEL, nature: 'Bold', evs: { hp: 252, def: 252 } });
  const bulkS = new Pokemon(gen, name, { level: LEVEL, nature: 'Calm', evs: { hp: 252, spd: 252 } });
  return { frail, bulkP, bulkS };
}

export function makeField(opts = {}) {
  return new Field({
    gameType: opts.doubles ? 'Doubles' : 'Singles',
    weather: opts.weather || undefined,
  });
}

function pctRange(result, defender) {
  const dmg = Array.isArray(result.damage) ? result.damage.flat(2) : [result.damage];
  const hp = defender.maxHP();
  const min = Math.min(...dmg), max = Math.max(...dmg);
  return { minPct: +(min / hp * 100).toFixed(1), maxPct: +(max / hp * 100).toFixed(1) };
}

// 確1/亂1/確2… 標記
export function koTag(minPct, maxPct) {
  if (minPct >= 100) return { tag: '確1', cls: 'ko1' };
  if (maxPct >= 100) return { tag: '亂1', cls: 'ko1r' };
  if (minPct >= 50) return { tag: '確2', cls: 'ko2' };
  if (maxPct >= 50) return { tag: '亂2', cls: 'ko2r' };
  if (minPct >= 33.4) return { tag: '確3', cls: 'ko3' };
  if (maxPct <= 0) return { tag: '無效', cls: 'ko0' };
  return { tag: '3+', cls: 'ko0' };
}

export function isStatusMove(moveName) {
  const m = gen.moves.get(toID(moveName));
  return !m || m.category === 'Status';
}

// 一次攻擊計算：attacker spec 的某招 vs defender（Pokemon 物件）
export function calcOne(attSpec, defenderMon, moveName, field, moveOverrides) {
  const attacker = makeMon(attSpec);
  const move = new Move(gen, moveOverrides ? 'Tackle' : moveName,
    moveOverrides ? { overrides: moveOverrides, useMax: false } : undefined);
  if (moveOverrides) move.name = moveName;
  const r = calculate(gen, attacker, defenderMon.clone ? defenderMon.clone() : defenderMon, move, field);
  return pctRange(r, defenderMon);
}

// 我方（known spec）→ 對面某隻（known 或 unknown）
// 回傳 [{move, minPct, maxPct, tag, cls, note}]
export function attackTable(mySpec, foe, field) {
  const rows = [];
  for (const mv of mySpec.moves || []) {
    if (isStatusMove(mv)) continue;
    try {
      if (foe.unknown) {
        const { frail, bulkP, bulkS } = unknownDefenders(foe.name);
        const m = gen.moves.get(toID(mv));
        const bulk = m && m.category === 'Special' ? bulkS : bulkP;
        const a = calcOne(mySpec, bulk, mv, field);   // 最耐
        const b = calcOne(mySpec, frail, mv, field);  // 最脆
        const worst = koTag(a.minPct, a.maxPct);
        const best = koTag(b.minPct, b.maxPct);
        rows.push({
          move: mv, minPct: a.minPct, maxPct: b.maxPct,
          tag: worst.tag === best.tag ? worst.tag : `${best.tag}~${worst.tag}`,
          cls: worst.cls, range: true,
          detail: `最脆 ${b.minPct}–${b.maxPct}%／最耐 ${a.minPct}–${a.maxPct}%`,
        });
      } else {
        const defender = makeMon(foe);
        const { minPct, maxPct } = calcOne(mySpec, defender, mv, field);
        const t = koTag(minPct, maxPct);
        rows.push({ move: mv, minPct, maxPct, tag: t.tag, cls: t.cls });
      }
    } catch (e) { /* 個別招式算不出來就跳過 */ }
  }
  rows.sort((a, b) => b.maxPct - a.maxPct);
  return rows;
}

// 對面 → 我方某隻。known 用其配置招式；unknown 用「雙屬性 100BP 極限火力」推估
export function incomingTable(foe, mySpec, field) {
  const defender = makeMon(mySpec);
  const rows = [];
  if (foe.unknown) {
    const sp = getSpecies(foe.name);
    if (!sp) return rows;
    for (const type of sp.types) {
      for (const cat of ['Physical', 'Special']) {
        try {
          const attSpec = {
            name: foe.name,
            nature: cat === 'Physical' ? 'Adamant' : 'Modest',
            evs: cat === 'Physical' ? { atk: 252 } : { spa: 252 },
          };
          const { minPct, maxPct } = calcOne(attSpec, defender, `${type} 100BP(${cat === 'Physical' ? '物' : '特'})`, field,
            { basePower: 100, type, category: cat });
          const t = koTag(minPct, maxPct);
          rows.push({ move: `${type}系100威力(${cat === 'Physical' ? '物理' : '特殊'})推估`, minPct, maxPct, tag: t.tag, cls: t.cls, est: true });
        } catch (e) { /* skip */ }
      }
    }
  } else {
    for (const mv of foe.moves || []) {
      if (isStatusMove(mv)) continue;
      try {
        const { minPct, maxPct } = calcOne(foe, defender, mv, field);
        const t = koTag(minPct, maxPct);
        rows.push({ move: mv, minPct, maxPct, tag: t.tag, cls: t.cls });
      } catch (e) { /* skip */ }
    }
  }
  rows.sort((a, b) => b.maxPct - a.maxPct);
  return rows;
}

// ---- 速度 ----
const SPEED_ABILITY = {
  Chlorophyll: 'Sun', 'Swift Swim': 'Rain', 'Sand Rush': 'Sand', 'Slush Rush': 'Snow',
};
export function speedInfo(spec, opts = {}) {
  // 回傳 { spe, mods: [label], min?, max? }（unknown 給區間）
  const sp = getSpecies(spec.mega || spec.name);
  if (!sp) return null;
  const base = sp.baseStats.spe;
  if (spec.unknown) {
    return {
      unknown: true,
      min: statAt(base, 0, 1),
      max: statAt(base, 252, 1.1),
      scarfMax: Math.floor(statAt(base, 252, 1.1) * 1.5),
    };
  }
  const mon = makeMon(spec);
  let spe = mon.rawStats.spe;
  const mods = [];
  if (spec.item === 'Choice Scarf' || spec.scarf) { spe = Math.floor(spe * 1.5); mods.push('圍巾×1.5'); }
  if (spec.boosterSpe) { spe = Math.floor(spe * 1.5); mods.push('能量×1.5'); }
  const ab = spec.mega ? (spec.megaAbility || (sp.abilities && sp.abilities['0'])) : spec.ability;
  if (SPEED_ABILITY[ab] && opts.weather === SPEED_ABILITY[ab]) {
    spe = spe * 2; mods.push(`${ab === 'Chlorophyll' ? '葉綠素' : ab}×2`);
  }
  if (opts.tailwind) { spe = spe * 2; mods.push('順風×2'); }
  return { spe, mods, baseSpe: mon.rawStats.spe };
}
