# 賽季更新 SOP（威脅庫 → 重建 → 重新部署）

觸發語：「更新 Champions 威脅資料庫」「新賽季」「更新威脅庫」。
一個賽季跑一次，一輪短對話完成。開始前先 `git log --oneline -3`＋讀 `ROADMAP.md` 確認狀態。

## 步驟

### 1. 搜尋當季 meta

- WebSearch 關鍵字：`Pokemon Champions usage stats top ranked <月份年份>`，
  另補一次雙打 tier list 搜尋。**注意今天日期**，不要抓到上一季資料。
- 來源優先序：Pikalytics、Pokémon Zone、Game8。多數網站在雲端環境被 egress 擋，
  **直接用搜尋結果摘要內文**即可，不要浪費回合硬爬原頁。
- 產出：Top 30–50 名單＋大略排名。與現有 `data/threats.js` 對比，列出「新增／移除／排名變動」。

### 2. 重寫 `data/threats.js`

- 每隻含 `zh / name / rank / item / ability / nature / evs / moves`；
  Mega 型態加 `mega`，新 Mega 特性若 calc 資料庫是佔位值，用 `megaAbility` 覆寫。
- 配置用該寶可夢的常見標準競技配置（訓練知識推估）。
- 檔頭註解更新：來源、搜尋日期、賽季名。
- 本季搜尋確認的標 rank 數字；常青候補沿用舊標記慣例（見現有檔案 rank 欄）。

### 3. 重跑分析＋重建網頁

```bash
node src/analyze.js        # 重跑對點分析 → out/report.html
node scripts/build.js      # web/ → docs/（bundle 含新 threats.js）
```

兩個指令都要跑：威脅庫是打包進 `docs/bundle.js` 的，不重建網頁工具就吃不到新資料。

### 4. Commit＋部署

```bash
git add -A && git commit -m "Season update: <賽季/月份> threats DB" && git push
```

- GitHub Pages 從 **main 分支 `/docs`** 服務：改動在工作分支的話，開 PR merge 進 main 才會上線。
- 上線後手機端 PWA 靠 sw.js 的 BUILD_ID 換版自動更新快取，開頁後重整一次即可。

### 5. 收尾

- 回報：新增／移除了哪些威脅、我方隊伍對新 meta 的明顯弱點（1–3 條）。
- 若隊伍需要調整，另開對話討論，不在更新流程裡展開。
