// 產生 data/zh-names.json：招式／特性／道具 英文→繁中 對照表（網頁顯示用）
// 來源：PokeAPI 官方 CSV（move_names / ability_names / item_names，local_language_id=4 = 繁體中文）
// 需要網路（下載 CSV）；產物 JSON 直接進版本庫，平常 npm run build 不需重跑
// 用法：node src/build-zh-names.js [已下載CSV的目錄]
const { Generations } = require('@smogon/calc');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gen = Generations.get(9);
const toID = s => ('' + s).toLowerCase().replace(/[^a-z0-9]/g, '');

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const FILES = ['moves.csv', 'move_names.csv', 'abilities.csv', 'ability_names.csv',
  'items.csv', 'item_names.csv'];
const ZH_HANT = '4'; // PokeAPI languages.csv：4 = zh-Hant

let dir = process.argv[2];
if (!dir) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeapi-csv-'));
  for (const f of FILES) {
    execSync(`curl -sS -o ${path.join(dir, f)} ${CSV_BASE}/${f}`, { stdio: 'inherit' });
  }
}

// 極簡 CSV 解析（這幾個檔沒有含逗號的欄位需求：name 欄取行尾即可）
function rows(file) {
  return fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n').slice(1);
}
function idToIdentifier(file) {
  const m = new Map();
  for (const line of rows(file)) {
    const [id, identifier] = line.split(',');
    m.set(id, toID(identifier));
  }
  return m;
}
function zhByIdentifier(namesFile, identById) {
  const m = new Map();
  for (const line of rows(namesFile)) {
    const parts = line.split(',');
    const [entryId, lang] = parts;
    if (lang !== ZH_HANT) continue;
    const ident = identById.get(entryId);
    if (ident) m.set(ident, parts.slice(2).join(','));
  }
  return m;
}

const moveZh = zhByIdentifier('move_names.csv', idToIdentifier('moves.csv'));
const abilityZh = zhByIdentifier('ability_names.csv', idToIdentifier('abilities.csv'));
const itemZh = zhByIdentifier('item_names.csv', idToIdentifier('items.csv'));

// calc 名稱 → PokeAPI identifier 拼法不同的別名
const MOVE_ALIAS = { visegrip: 'vicegrip' };
const ABILITY_ALIAS = {
  embodyaspectcornerstone: 'embodyaspect', embodyaspecthearthflame: 'embodyaspect',
  embodyaspectteal: 'embodyaspect', embodyaspectwellspring: 'embodyaspect',
};

// calc 的 Mega 石／某些道具與 PokeAPI 拼法不同
const ITEM_ALIAS = { abilityshield: 'ability-shield' };
// 遊戲內顯示名與 PokeAPI zh-Hant 不同的（以遊戲畫面為準；發現一個補一個）
const ITEM_ZH_OVERRIDE = { figyberry: '文柚果' };

// 只收 @smogon/calc gen9 實際存在的招式／特性／道具，控制檔案大小
const out = { moves: {}, abilities: {}, items: {} };
const missMoves = [], missAbilities = [], missItems = [];
for (const mv of gen.moves) {
  const id = toID(mv.name);
  if (!id || id === 'nomove') continue;
  const zh = moveZh.get(id) || moveZh.get(MOVE_ALIAS[id]);
  if (zh) out.moves[id] = zh;
  else missMoves.push(mv.name);
}
for (const ab of gen.abilities) {
  const id = toID(ab.name);
  if (!id) continue;
  const zh = abilityZh.get(id) || abilityZh.get(ABILITY_ALIAS[id]);
  if (zh) out.abilities[id] = zh;
  else missAbilities.push(ab.name);
}

for (const it of gen.items) {
  const id = toID(it.name);
  if (!id) continue;
  const zh = ITEM_ZH_OVERRIDE[id] || itemZh.get(id) || itemZh.get(ITEM_ALIAS[id]);
  if (zh) out.items[id] = zh;
  else missItems.push(it.name);
}

const outPath = path.join(__dirname, '../data/zh-names.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('written', outPath,
  Object.keys(out.moves).length, 'moves,',
  Object.keys(out.abilities).length, 'abilities,',
  Object.keys(out.items).length, 'items');
if (missMoves.length) console.log('無中文對照的招式（將顯示英文）：', missMoves.join(', '));
if (missAbilities.length) console.log('無中文對照的特性（將顯示英文）：', missAbilities.join(', '));

// 抽查
for (const q of ['U-turn', 'Earthquake', 'Fake Out', 'Kowtow Cleave', 'Last Respects'])
  console.log(q, '→', out.moves[toID(q)]);
for (const q of ['Intimidate', 'Good as Gold', 'Chlorophyll'])
  console.log(q, '→', out.abilities[toID(q)]);
for (const q of ['Choice Scarf', 'Figy Berry', 'Charizardite Y', 'Leftovers', 'Life Orb', 'Fairy Feather'])
  console.log(q, '→', out.items[toID(q)]);
