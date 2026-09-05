// 產生 data/search-index.json：瀏覽器搜尋用（中文繁體、注音頭字、拼音頭字、英文）
// 來源：@smogon/calc gen9 物種表 × pokemon 套件多語名 × pinyin-pro
// 一次性建置；瀏覽器端只做字串比對，不需任何函式庫
const { Generations } = require('@smogon/calc');
const zhHant = require('pokemon/data/zh-hant.json'); // index = 圖鑑編號-1
const en = require('pokemon/data/en.json');
const { pinyin } = require('pinyin-pro');
const fs = require('fs');
const path = require('path');

const gen = Generations.get(9);

// 英文名 → 圖鑑編號（用 pokemon 套件的 en 名對回去）
// 兩邊拼字有差：calc 用彎引號（Farfetch’d）、é 的 unicode 正規化不同，先 norm 再比
const norm = s => s.normalize('NFC').replace(/’/g, "'");
const dexNoByEn = new Map(en.map((n, i) => [norm(n), i + 1]));
// calc 名 → pokemon 套件名的例外（Aegislash 在 calc 的 baseSpecies 是 Aegislash-Blade）
const DEX_ALIAS = {
  'Nidoran-F': 'Nidoran♀', 'Nidoran-M': 'Nidoran♂',
  'Aegislash-Blade': 'Aegislash',
};

// pinyin 音節 → 注音第一個符號
const INITIALS = {
  zh: 'ㄓ', ch: 'ㄔ', sh: 'ㄕ',
  b: 'ㄅ', p: 'ㄆ', m: 'ㄇ', f: 'ㄈ', d: 'ㄉ', t: 'ㄊ', n: 'ㄋ', l: 'ㄌ',
  g: 'ㄍ', k: 'ㄎ', h: 'ㄏ', j: 'ㄐ', q: 'ㄑ', x: 'ㄒ', r: 'ㄖ',
  z: 'ㄗ', c: 'ㄘ', s: 'ㄙ',
};
const ZERO_INITIAL = [
  ['yu', 'ㄩ'], ['y', 'ㄧ'], ['w', 'ㄨ'], ['er', 'ㄦ'],
  ['ai', 'ㄞ'], ['ao', 'ㄠ'], ['ang', 'ㄤ'], ['an', 'ㄢ'], ['a', 'ㄚ'],
  ['ou', 'ㄡ'], ['o', 'ㄛ'],
  ['ei', 'ㄟ'], ['eng', 'ㄥ'], ['en', 'ㄣ'], ['e', 'ㄜ'],
];
function zhuyinInitial(syl) {
  if (INITIALS[syl.slice(0, 2)]) return INITIALS[syl.slice(0, 2)];
  if (INITIALS[syl[0]]) return INITIALS[syl[0]];
  for (const [pre, zy] of ZERO_INITIAL) if (syl.startsWith(pre)) return zy;
  return syl; // 非中文字（Ｑ、Ｚ、２…）原樣保留
}

// 全形英數 → 半形（謎擬Ｑ、多邊獸Ｚ…）
function toHalf(s) {
  return s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function searchKeys(zhName) {
  const syls = pinyin(zhName, { toneType: 'none', type: 'array' });
  let zy = '', py = '';
  for (const s of syls) {
    const low = toHalf(s).toLowerCase();
    zy += zhuyinInitial(low);
    py += low[0] || '';
  }
  return { zy, py };
}

// 形態後綴 → 中文標註（未列出的直接顯示英文後綴）
const FORME_ZH = {
  'Mega': 'Mega', 'Mega-X': 'Mega X', 'Mega-Y': 'Mega Y', 'Mega-Z': 'Mega Z',
  'Alola': '阿羅拉', 'Galar': '伽勒爾', 'Hisui': '洗翠',
  'Paldea': '帕底亞', 'Paldea-Combat': '帕底亞·鬥', 'Paldea-Blaze': '帕底亞·火', 'Paldea-Aqua': '帕底亞·水',
  'Therian': '靈獸', 'Incarnate': '化身', 'Origin': '起源', 'Sky': '天空',
  'Crowned': '王之姿', 'Shadow': '騎黑馬', 'Ice': '騎白馬',
  'Rapid-Strike': '流水', 'Single-Strike': '一擊',
  'Wellspring': '水井面具', 'Hearthflame': '火灶面具', 'Cornerstone': '礎石面具', 'Teal': '碧草面具',
  'Wash': '清洗', 'Heat': '加熱', 'Mow': '割草', 'Frost': '結冰', 'Fan': '旋轉',
  'F': '雌性', 'Female': '雌性',
  'Dusk-Mane': '黃昏鬃', 'Dawn-Wings': '拂曉翼', 'Ultra': '究極',
  'Black': '闇黑', 'White': '焰白',
  'Bloodmoon': '血月', 'Four': '四家族', 'Three': '三家族',
  'Zero': '零式', 'Hero': '全能', 'Terastal': '太晶', 'Stellar': '星晶',
  'Low-Key': '低調', 'Amped': '高調',
  'Dusk': '黃昏', 'Dawn': '拂曉', 'Midnight': '黑夜',
  'Unbound': '解放', 'Ash': '小智', 'Primal': '原始回歸',
  'Attack': '攻擊', 'Defense': '防禦', 'Speed': '速度',
  'Sensu': '扇之舞', 'Pom-Pom': '啦啦隊', "Pa'u": '呼拉', 'Baile': '熱辣熱辣',
  'Blade': '刀劍形態', 'Shield': '盾牌形態', '10%': '10%', 'Complete': '完全體',
};

// 排除：對戰工具用不到的形態
const EXCLUDE = /-(Gmax|Totem|Cosplay|Starter|World|Original|Hoenn|Sinnoh|Unova|Kalos|Partner|Belle|Libre|PhD|Pop-Star|Rock-Star|Cap|School|Meteor|Busted|Eternamax|Gulping|Gorging|Noice|Hangry|Sunshine|Sunny|Rainy|Snowy|Antique|Crest|Droopy|Stretchy|Green-Plumage|Blue-Plumage|Yellow-Plumage|White-Plumage|Family-of-Three|Roaming|Everdecay)/;

const out = [];
const seen = new Set();
for (const sp of gen.species) {
  if (EXCLUDE.test(sp.name)) continue;
  if (sp.name === 'Aegislash-Both') continue; // calc 內部用的雙形態合併計算，不是實際形態
  const baseEn = sp.baseSpecies || sp.name;
  const baseAlias = DEX_ALIAS[baseEn] || baseEn;
  const dexNo = dexNoByEn.get(norm(baseAlias));
  if (!dexNo) continue; // 對不回圖鑑＝CAP 假寶可夢，正確排除
  const baseZh = zhHant[dexNo - 1];
  let zh = baseZh;
  if (sp.name !== baseAlias && sp.name.startsWith(baseAlias + '-')) {
    const suffix = sp.name.slice(baseAlias.length + 1);
    zh = `${baseZh}(${FORME_ZH[suffix] || suffix})`;
  }
  if (seen.has(sp.name)) continue;
  seen.add(sp.name);
  const { zy, py } = searchKeys(baseZh);
  out.push({ n: sp.name, zh, zy, py, no: dexNo });
}

const outPath = path.join(__dirname, '../data/search-index.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('written', outPath, out.length, 'entries');
// 抽查
for (const q of ['Garchomp', 'Charizard-Mega-Y', 'Landorus-Therian', 'Urshifu-Rapid-Strike', 'Ogerpon-Hearthflame', 'Mimikyu', 'Ninetales-Alola'])
  console.log(out.find(e => e.n === q));
