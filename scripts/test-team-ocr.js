// 我方隊伍兩張截圖的完整判讀驗證：狀態頁（EV/性格）＋能力頁（特性/道具/招式）
// 用法：node scripts/test-team-ocr.js <狀態頁.png> <能力頁.png> --glyphs <字形表.json>
//       （字形表產法見 test-team-recognizer.js 檔頭；瀏覽器端用 canvas 即時畫）
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { Generations } = require('@smogon/calc');

const root = path.join(__dirname, '..');
const meta = require(path.join(root, 'data/sprite-meta.json'));
const bin = fs.readFileSync(path.join(root, 'data/sprite-index.bin'));
const searchIndex = require(path.join(root, 'data/search-index.json'));
const zhNames = require(path.join(root, 'data/zh-names.json'));
const myTeam = require(path.join(root, 'data/my-team.js'));

const gen = Generations.get(9);
const toID = s => ('' + s).toLowerCase().replace(/[^a-z0-9]/g, '');
const LEVEL = 50;
function statAt(base, ev, mul, isHP) {
  const core = Math.floor((2 * base + 31 + Math.floor(ev / 4)) * LEVEL / 100);
  return isHP ? core + LEVEL + 10 : Math.floor((core + 5) * mul);
}

const args = process.argv.slice(2);
let glyphPath = null; const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--glyphs') { glyphPath = args[++i]; continue; }
  files.push(args[i]);
}
const tab = JSON.parse(fs.readFileSync(glyphPath, 'utf8'));
const cache = new Map();
const dtab = glyphPath ? JSON.parse(fs.readFileSync(glyphPath.replace('g12','digits20'), 'utf8')) : {};
const digitGlyph = ch => (dtab[ch] ? { d: Float32Array.from(dtab[ch].d), ar: dtab[ch].ar } : null);
const glyph = ch => {
  if (!cache.has(ch)) cache.set(ch, tab[ch] ? Float32Array.from(tab[ch]) : null);
  return cache.get(ch);
};
const png = f => { const p = PNG.sync.read(fs.readFileSync(f)); return { width: p.width, height: p.height, data: p.data }; };

function byLenOf(pairs) {
  const m = new Map();
  for (const [name, zh] of pairs) {
    if (!zh) continue;
    const k = zh.length;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push({ zh, n: name });
  }
  return m;
}

(async () => {
  const mc = await import('../web/match-core.js');
  const tc = await import('../web/text-core.js');
  const oc = await import('../web/team-ocr.js');
  const lib = mc.parseLib(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta.count, meta.champ);

  const nameByLen = byLenOf(searchIndex.map(e => [e.n, e.zh]));
  const mkList = (iter, dict) => {
    const out = [];
    for (const e of iter) { const zh = dict[toID(e.name)]; if (zh) out.push([e.name, zh]); }
    return out;
  };
  const abilityByLen = byLenOf(mkList(gen.abilities, zhNames.abilities));
  const itemByLen = byLenOf(mkList(gen.items, zhNames.items));
  const moveByLen = byLenOf(mkList(gen.moves, zhNames.moves));
  const natures = [];
  for (const n of gen.natures) natures.push(n);

  const ctx = {
    glyph, digitGlyph, natures, statAt,
    zhOf: n => (searchIndex.find(e => e.n === n) || {}).zh || n,
    getSpecies: n => gen.species.get(toID(n)),
    moveType: n => { const m = gen.moves.get(toID(n)); return m ? m.type : null; },
    megaStoneOf: n => { const it = gen.items.get(toID(n)); return it ? it.megaStone : null; },
    toID,
    abilityByLen, itemByLen, moveByLen,
    matchCardName: (img, card) => {
      const strip = tc.nameStrip(img, card);
      const byName = strip ? tc.matchName(strip, nameByLen, glyph, 8) : [];
      const m = mc.matchTeamCard(img, card, lib, 60);
      const sprite = new Map();
      for (const r of (m ? m.results : [])) {
        const nm = meta.names[r.i];
        if (/-Mega(-|$)/.test(nm)) continue;
        if (!sprite.has(nm) || sprite.get(nm) < r.score) sprite.set(nm, r.score);
      }
      return byName.map(b => ({ ...b, score2: (1 - b.score) + 0.3 * (sprite.get(b.name) || 0) }))
        .sort((a, b) => b.score2 - a.score2).slice(0, 5);
    },
  };

  const stImg = png(files[0]), abImg = png(files[1]);
  const stCards = mc.detectTeamCards(stImg), abCards = mc.detectTeamCards(abImg);
  console.log(`狀態頁 ${stCards.length} 卡、能力頁 ${abCards.length} 卡`);
  const rows = oc.mergePages(oc.readStatusPage(stImg, stCards, ctx), oc.readAbilityPage(abImg, abCards, ctx), ctx);

  // 標準答案＝ repo 的 data/my-team.js
  let pass = 0, total = 0;
  const chk = (n, ok, got, want) => { total++; if (ok) pass++; console.log(`  ${ok ? '✓' : '✗'} ${n}${ok ? '' : `  得到 ${got}｜應為 ${want}`}`); };
  rows.forEach((r, i) => {
    const want = myTeam[i];
    console.log(`\n卡${r.slot} ${r.spec.zh}（應為 ${want.zh}）  SP合計 ${r.spSum}`);
    chk('名字', r.spec.name === want.name, r.spec.name, want.name);
    chk('EV', JSON.stringify(r.spec.evs) === JSON.stringify(want.evs), JSON.stringify(r.spec.evs), JSON.stringify(want.evs));
    chk('性格', r.spec.nature === want.nature, r.spec.nature, want.nature);
    chk('特性', r.spec.ability === want.ability, r.spec.ability, want.ability);
    chk('道具', r.spec.item === want.item, r.spec.item, want.item);
    const mvOk = JSON.stringify(r.spec.moves) === JSON.stringify(want.moves);
    chk('招式', mvOk, JSON.stringify(r.spec.moves), JSON.stringify(want.moves));
  });
  console.log(`\n合計 ${pass}/${total} 欄位正確（${(pass / total * 100).toFixed(1)}%）`);
  process.exit(pass === total ? 0 : 1);
})();
