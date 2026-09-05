// 我方隊伍畫面辨識驗證：偵測 6 張卡 → 認名字（主）＋認圖示（輔）→ 比對標準答案。
// 用法：node scripts/test-team-recognizer.js <資料夾或png>... （答案放同名 .txt，一行一隻英文名）
// 註：node 沒有 canvas，字形描述子表要用 --glyphs 指定；瀏覽器端是用裝置字體即時畫的
// （recognize.js 的 glyphDesc）。產生方法（任何有 CJK 字體的環境都可以）：
//   python3 - <<'EOF'
//   from PIL import Image, ImageDraw, ImageFont; import numpy as np, json
//   G=12; idx=json.load(open('data/search-index.json'))
//   font=ImageFont.truetype('<某個 CJK ttf/ttc>',64)
//   ... 逐字畫在 160x160 上、取墨水 bbox、等比置中縮成 G×G 平均密度 → {字: [G*G 個數值]}
//   EOF
// 這支測試只是回歸參考；正式驗證請用真實截圖在瀏覽器跑（見 ROADMAP M4.4）。
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const meta = require(path.join(root, 'data/sprite-meta.json'));
const bin = fs.readFileSync(path.join(root, 'data/sprite-index.bin'));
const searchIndex = require(path.join(root, 'data/search-index.json'));

const args = process.argv.slice(2);
let glyphPath = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--glyphs') { glyphPath = args[++i]; continue; }
  const st = fs.statSync(args[i]);
  if (st.isDirectory()) for (const f of fs.readdirSync(args[i])) { if (/\.png$/i.test(f)) files.push(path.join(args[i], f)); }
  else files.push(args[i]);
}
const glyphTab = glyphPath ? JSON.parse(fs.readFileSync(glyphPath, 'utf8')) : {};
const glyphCache = new Map();
const glyph = ch => {
  if (!glyphCache.has(ch)) glyphCache.set(ch, glyphTab[ch] ? Float32Array.from(glyphTab[ch]) : null);
  return glyphCache.get(ch);
};

(async () => {
  const mc = await import('../web/match-core.js');
  const tc = await import('../web/text-core.js');
  const lib = mc.parseLib(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta.count, meta.champ);
  const namesByLen = new Map();
  for (const e of searchIndex) {
    const k = e.zh.length;
    if (!namesByLen.has(k)) namesByLen.set(k, []);
    namesByLen.get(k).push(e);
  }
  const W_SPRITE = +(process.env.W_SPRITE || 0.35); // 圖示輔助權重

  let n = 0, t1 = 0, t3 = 0, cardsAll = 0;
  for (const f of files) {
    const png = PNG.sync.read(fs.readFileSync(f));
    const img = { width: png.width, height: png.height, data: png.data };
    const cards = mc.detectTeamCards(img);
    cardsAll += cards.length;
    const ansFile = f.replace(/\.png$/i, '.txt');
    const ans = fs.existsSync(ansFile) ? fs.readFileSync(ansFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : null;
    console.log(`\n== ${path.basename(f)} ${img.width}x${img.height} 卡片 ${cards.length}`);
    cards.forEach((c, i) => {
      const strip = tc.nameStrip(img, c);
      const byName = strip ? tc.matchName(strip, namesByLen, glyph, 8) : [];
      // 圖示分數（輔助）：同英文名取最高
      const m = mc.matchTeamCard(img, c, lib, 60);
      const spriteScore = new Map();
      for (const r of (m ? m.results : [])) {
        const nm = meta.names[r.i];
        if (!spriteScore.has(nm) || spriteScore.get(nm) < r.score) spriteScore.set(nm, r.score);
      }
      const merged = byName.map(b => ({
        ...b,
        total: (1 - b.score) + W_SPRITE * (spriteScore.get(b.name) || 0),
      })).sort((a, b) => b.total - a.total);
      const want = ans ? ans[i] : null;
      let mark = '';
      if (want) {
        n++;
        const at = merged.findIndex(x => x.name === want);
        if (at === 0) { t1++; t3++; mark = '✓'; }
        else if (at >= 0 && at < 3) { t3++; mark = `△top${at + 1}`; }
        else mark = `✗(答案 ${want})`;
      }
      console.log(`  卡${i + 1} ${mark} ` + merged.slice(0, 4).map(x => `${x.zh}:${x.total.toFixed(3)}`).join('  '));
    });
  }
  if (n) {
    const pct = v => (v / n * 100).toFixed(1) + '%';
    console.log(`\n合計 ${n} 卡（偵測 ${cardsAll}）：top1 ${pct(t1)}／top3 ${pct(t3)}  [圖示權重 ${W_SPRITE}]`);
    process.exit(t1 === n ? 0 : 1);
  }
})();
