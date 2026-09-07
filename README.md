# pokemon-tools

Pokémon Champions 對戰分析工具（隊伍「Meta」）。

## 對戰即用網頁工具（M1）

對戰中打開網頁 → 搜尋點選對手 6 隻 → 立即看三面板：**陣容推薦／速度線／傷害矩陣**。
全部在瀏覽器端計算（@smogon/calc Gen 9 打包），零網路、零 token 成本，支援離線（PWA）。

- 搜尋：中文（陸鯊）／注音頭字（ㄌㄧㄌ）／英文（garch），涵蓋全圖鑑與各形態（Mega、地區形態…）
- 威脅庫 Top 50：已知配置直接套用；庫外寶可夢以「極限值區間」推估（耐久最少~最多、STAB 100威力火力上限）
- 推薦：規則評分（確1/亂1/確2、被確1、速度優勢、特性剋制：金身擋變化招／不屈之心·唱反調反制威嚇／天氣戰）
- 單打／雙打、天氣、順風、戲法空間切換；我的隊伍可貼 Showdown paste 匯入（存 localStorage）
- 網址參數預填（M3 用）：`?foes=garchomp,primarina&mode=singles`

### 部署（GitHub Pages）

`docs/` 即建置產物。啟用方式：repo Settings → Pages → Source 選 `main` 分支 `/docs` 目錄。
啟用後網址為 `https://naiyu29.github.io/pokemon-tools/`，手機瀏覽器「加入主畫面」即可當 app 用。

### 建置（改資料後重跑）

```bash
npm install
npm run build   # 重建搜尋索引 + 打包到 docs/
```

## 內容

- `web/`：網頁工具原始碼（calc-core／recommend／main／index.html／sw）
- `docs/`：建置產物（GitHub Pages 服務目錄）
- `data/my-team.js`：我的隊伍（內建預設；網頁端可用 paste 匯入覆蓋）
- `data/threats.js`：當季威脅 Top 50 與常見配置（推估，含來源註記）
- `data/search-index.json`：搜尋索引（產生自 `src/build-search-index.js`）
- `src/analyze.js`：Node 端傷害分析（輸出 `out/analysis.json`）
- `out/report.html`：手機版賽季報告（自包含 HTML）

## 賽季更新（M2 SOP）

開新對話：「讀 pokemon-tools repo 的 ROADMAP.md，更新 Champions 威脅資料庫」→
更新 `data/threats.js` → `npm run build` → commit push。
