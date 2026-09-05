// M4.2 端上辨識 POC：建置 sprite 描述子庫
// 來源：PokeAPI sprites repo（HOME 渲染圖，raw.githubusercontent.com）
// 產出：data/sprite-index.bin（每筆 16×16 RGB 768B ＋ alpha 遮罩 32B ＝ 800B）
//       data/sprite-meta.json（順序對齊的名稱表，bundle 直接 import）
// 原始圖快取在 --cache 指定目錄（預設 .sprite-cache/，已 gitignore），重跑不重抓
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SIZE = 16;
const BYTES_PER = SIZE * SIZE * 3 + SIZE * SIZE / 8; // 800
const root = path.join(__dirname, '..');
const cacheDir = process.argv.includes('--cache')
  ? process.argv[process.argv.indexOf('--cache') + 1]
  : path.join(root, '.sprite-cache');
fs.mkdirSync(cacheDir, { recursive: true });

const searchIndex = require(path.join(root, 'data/search-index.json'));

const RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const API_INDEX = 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/pokemon/index.json';

// PS 名 → PokeAPI 名的例外對照（一般規則：小寫、空格/./'/: 移除或轉連字號）
const ALIAS = {
  'indeedee-f': 'indeedee-female', 'indeedee': 'indeedee-male',
  'meowstic-f': 'meowstic-female', 'meowstic': 'meowstic-male',
  'basculegion-f': 'basculegion-female', 'basculegion': 'basculegion-male',
  'oinkologne-f': 'oinkologne-female', 'oinkologne': 'oinkologne-male',
  'urshifu': 'urshifu-single-strike', 'urshifu-rapid-strike': 'urshifu-rapid-strike',
  'zygarde-10': 'zygarde-10', 'zygarde-10%': 'zygarde-10',
  'necrozma-dawn-wings': 'necrozma-dawn', 'necrozma-dusk-mane': 'necrozma-dusk',
  'oricorio-pa-u': 'oricorio-pau', "oricorio-pa'u": 'oricorio-pau',
  'lycanroc': 'lycanroc-midday', 'wishiwashi': 'wishiwashi-solo',
  'minior': 'minior-red-meteor', 'mimikyu': 'mimikyu-disguised',
  'toxtricity': 'toxtricity-amped', 'eiscue': 'eiscue-ice', 'morpeko': 'morpeko-full-belly',
  'darmanitan': 'darmanitan-standard', 'darmanitan-galar': 'darmanitan-galar-standard',
  'aegislash': 'aegislash-shield', 'pumpkaboo': 'pumpkaboo-average', 'gourgeist': 'gourgeist-average',
  'basculin': 'basculin-red-striped', 'keldeo': 'keldeo-ordinary', 'meloetta': 'meloetta-aria',
  'deoxys': 'deoxys-normal', 'wormadam': 'wormadam-plant', 'giratina': 'giratina-altered',
  'shaymin': 'shaymin-land', 'tornadus': 'tornadus-incarnate', 'thundurus': 'thundurus-incarnate',
  'landorus': 'landorus-incarnate', 'enamorus': 'enamorus-incarnate',
  'zacian': 'zacian', 'zamazenta': 'zamazenta', 'palafin': 'palafin-zero',
  'maushold': 'maushold-family-of-four', 'squawkabilly': 'squawkabilly-green-plumage',
  'tatsugiri': 'tatsugiri-curly', 'dudunsparce': 'dudunsparce-two-segment',
  'nidoran-f': 'nidoran-f', 'nidoran-m': 'nidoran-m',
  'ogerpon-wellspring': 'ogerpon-wellspring-mask', 'ogerpon-hearthflame': 'ogerpon-hearthflame-mask',
  'ogerpon-cornerstone': 'ogerpon-cornerstone-mask',
  'tauros-paldea-combat': 'tauros-paldea-combat-breed', 'tauros-paldea-blaze': 'tauros-paldea-blaze-breed',
  'tauros-paldea-aqua': 'tauros-paldea-aqua-breed',
};

function toApiName(psName) {
  let s = psName.toLowerCase()
    .replace(/[’']/g, '').replace(/\./g, '').replace(/[:%]/g, '')
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/-$/, '');
  return ALIAS[s] || s;
}

// 用 curl 下載（會吃 HTTPS_PROXY 環境變數；node 原生 https 不會）
const { execFile } = require('child_process');
function get(url) {
  return new Promise(resolve => {
    execFile('curl', ['-sf', '--max-time', '60', url],
      { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => resolve(err ? null : stdout));
  });
}

async function fetchSprite(apiId, tag) {
  const file = path.join(cacheDir, `${tag}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  // 先試 HOME 渲染圖（風格接近現代遊戲選單圖示），沒有再退回預設 96px sprite
  let buf = await get(`${RAW}/other/home/${apiId}.png`);
  if (!buf) buf = await get(`${RAW}/${apiId}.png`);
  if (buf) fs.writeFileSync(file, buf);
  return buf;
}

// 透明邊裁切＋等比例縮到 SIZE×SIZE（置中 letterbox），輸出 RGB＋遮罩
function toDescriptor(png) {
  const { width: w, height: h, data } = png;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] >= 32) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const scale = SIZE / Math.max(bw, bh);
  const ow = Math.max(1, Math.round(bw * scale)), oh = Math.max(1, Math.round(bh * scale));
  const offX = (SIZE - ow) >> 1, offY = (SIZE - oh) >> 1;
  const rgb = new Uint8Array(SIZE * SIZE * 3);
  const mask = new Uint8Array(SIZE * SIZE / 8);
  for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
    // box average 對應原圖區塊
    const sx0 = x0 + Math.floor(ox / scale), sx1 = Math.min(x1, x0 + Math.ceil((ox + 1) / scale) - 1);
    const sy0 = y0 + Math.floor(oy / scale), sy1 = Math.min(y1, y0 + Math.ceil((oy + 1) / scale) - 1);
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = sy0; sy <= sy1; sy++) for (let sx = sx0; sx <= sx1; sx++) {
      const i = (sy * w + sx) * 4, al = data[i + 3] / 255;
      r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
    }
    const px = (offY + oy) * SIZE + (offX + ox);
    if (n && a / n > 0.35) {
      rgb[px * 3] = r / a; rgb[px * 3 + 1] = g / a; rgb[px * 3 + 2] = b / a;
      mask[px >> 3] |= 1 << (px & 7);
    }
  }
  return { rgb, mask };
}

(async () => {
  const idxBuf = await get(API_INDEX);
  if (!idxBuf) throw new Error('抓不到 PokeAPI index');
  const apiIds = new Map(JSON.parse(idxBuf).results.map(r =>
    [r.name, +r.url.match(/\/(\d+)\/$/)[1]]));

  const names = [], bins = [];
  let fellBack = 0, missed = [];
  let done = 0;
  const queue = [...searchIndex];
  async function worker() {
    while (queue.length) {
      const e = queue.shift();
      let apiId = apiIds.get(toApiName(e.n));
      if (!apiId) { apiId = e.no; fellBack++; } // 查無形態 → 用基礎種 dex 編號
      const buf = await fetchSprite(apiId, toApiName(e.n));
      if (!buf) { missed.push(e.n); continue; }
      let d;
      try { d = toDescriptor(PNG.sync.read(buf)); } catch (err) { missed.push(e.n); continue; }
      if (!d) { missed.push(e.n); continue; }
      names.push(e.n);
      bins.push(Buffer.concat([Buffer.from(d.rgb), Buffer.from(d.mask)]));
      if (++done % 100 === 0) console.log(`  ${done}/${searchIndex.length}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  // names/bins 因併發完成順序不定，依名稱排序保證輸出穩定
  const order = names.map((n, i) => i).sort((a, b) => names[a] < names[b] ? -1 : 1);
  const sortedNames = order.map(i => names[i]);
  const bin = Buffer.concat(order.map(i => bins[i]));

  fs.writeFileSync(path.join(root, 'data/sprite-index.bin'), bin);
  fs.writeFileSync(path.join(root, 'data/sprite-meta.json'), JSON.stringify({
    size: SIZE, bytesPer: BYTES_PER, count: sortedNames.length, names: sortedNames,
  }));
  console.log(`sprite-index: ${sortedNames.length} 筆（fallback 基礎種 ${fellBack}、失敗 ${missed.length}）`);
  console.log(`bin ${(bin.length / 1024).toFixed(0)}KB`);
  if (missed.length) console.log('失敗名單:', missed.join(', '));
})();
