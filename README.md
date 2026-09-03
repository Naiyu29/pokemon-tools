# pokemon-tools

Pokémon Champions 對戰分析工具（隊伍「Meta」）。

## 內容
- `data/my-team.js`：我的隊伍（由遊戲截圖轉出的 Showdown 等效配置）
- `data/threats.js`：當季熱門威脅與其常見配置（推估）
- `src/analyze.js`：傷害計算＋速度線分析（@smogon/calc + @pkmn/dex），輸出 `out/analysis.json`
- `out/report.html`：手機版分析報告（自包含 HTML）

## 使用
```bash
npm install
node src/analyze.js
```

更新隊伍或威脅後重跑 `analyze.js`，再依 `out/analysis.json` 更新報告數據。
