// 陣容推薦：規則評分（ROADMAP 1.4，2026-09-03 決策 Q1=A）
// 分數構成：我方確1/亂1/確2 對面數 − 被確1/亂1 數 ＋ 速度優勢 ＋ 特性剋制規則
import { attackTable, incomingTable, speedInfo, getSpecies, isStatusMove } from './calc-core.js';
import { moveZh, abilityZh } from './zh-names.js';

// 對面特性 → 對我方特定成員的規則
const BOOST_ON_INTIMIDATE = new Set(['Defiant', 'Competitive', 'Guard Dog', 'Contrary']); // 不屈之心/不服輸/看門犬/唱反調
const WEATHER_SETTER = { 'Sand Stream': '沙暴', 'Drizzle': '雨天', 'Snow Warning': '雪天' };

export function recommend(myTeam, foes, opts) {
  const field = opts.field;
  const results = myTeam.map(me => {
    let score = 0;
    const reasons = [];
    const meSpeed = speedInfo(me, { weather: opts.weather });
    let faster = 0, slower = 0;

    for (const foe of foes) {
      const zh = foe.zh || foe.name;
      // 火力
      const atk = attackTable(me, foe, field);
      const best = atk[0];
      if (best) {
        if (best.tag.includes('確1') && !best.tag.includes('~')) { score += 3; reasons.push(`確1 ${zh}（${moveZh(best.move)}）`); }
        else if (best.tag.includes('亂1')) { score += 2; reasons.push(`亂1 ${zh}（${moveZh(best.move)}）`); }
        else if (best.tag.includes('確2')) { score += 1; }
        else if (best.maxPct <= 20) { score -= 1; reasons.push(`打不動 ${zh}（最高 ${best.maxPct}%）`); }
      }
      // 被打
      const inc = incomingTable(foe, me, field);
      const worst = inc[0];
      if (worst) {
        if (worst.minPct >= 100) { score -= 3; reasons.push(`被 ${zh} 確1（${moveZh(worst.move)}）`); }
        else if (worst.maxPct >= 100) { score -= 2; reasons.push(`被 ${zh} 亂1（${moveZh(worst.move)}）`); }
        else if (worst.minPct >= 50) { score -= 1; }
      }
      // 速度
      const fs = speedInfo(foe, { weather: opts.weather });
      if (fs && meSpeed) {
        const foeSpe = fs.unknown ? fs.max : fs.spe;
        if (meSpeed.spe > foeSpe) { score += 1; faster++; }
        else if (meSpeed.spe < (fs.unknown ? fs.min : fs.spe)) { score -= 0.5; slower++; }
      }
      // 特性規則
      const foeAb = foe.unknown ? null : (foe.megaAbility || foe.ability);
      if (foeAb && BOOST_ON_INTIMIDATE.has(foeAb) && me.ability === 'Intimidate') {
        score -= 2; reasons.push(`⚠ ${zh} 特性 ${abilityZh(foeAb)}：威嚇反被加成`);
      }
      if (foeAb === 'Good as Gold') {
        const statusCnt = (me.moves || []).filter(isStatusMove).length;
        if (statusCnt >= 2) { score -= 2; reasons.push(`⚠ ${zh} 金身：變化招（${statusCnt}招）被擋`); }
      }
      if (foeAb && WEATHER_SETTER[foeAb]) {
        const weatherDependent = me.ability === 'Chlorophyll' || me.mega === 'Charizard-Mega-Y'
          || (me.moves || []).includes('Solar Beam');
        if (weatherDependent) { score -= 1; reasons.push(`⚠ ${zh} 會開${WEATHER_SETTER[foeAb]}：天氣戰`); }
      }
      if (foe.unknown) {
        const sp = getSpecies(foe.name);
        if (sp) reasons.push(`ℹ ${zh} 配置未知，以極限值推估`);
      }
    }
    if (faster >= Math.ceil(foes.length / 2) && foes.length > 1) reasons.push(`比 ${faster}/${foes.length} 隻快`);
    return { spec: me, score: +score.toFixed(1), reasons: dedupe(reasons), faster, slower };
  });

  results.sort((a, b) => b.score - a.score);
  const picks = results.slice(0, 4);
  // 首發：雙打取前 2、單打取前 1（優先 Fake Out／速度）
  const leadPool = [...picks].sort((a, b) => {
    const fa = (a.spec.moves || []).includes('Fake Out') ? 1 : 0;
    const fb = (b.spec.moves || []).includes('Fake Out') ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return b.score - a.score;
  });
  const leads = leadPool.slice(0, opts.doubles ? 2 : 1);
  return { ranked: results, picks, leads };
}

function dedupe(arr) { return [...new Set(arr)]; }
