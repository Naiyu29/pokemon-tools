---
name: pokemon-champions
description: Pokémon Champions（寶可夢冠軍）對戰分析工作流——隊伍截圖轉 Showdown paste、賽前選角截圖分析（辨識對手、傷害計算、選4與首發建議）、對點分析報告、賽季威脅庫更新。只要使用者貼出 Pokémon Champions 的遊戲截圖（隊伍能力/狀態頁、選角畫面、對戰畫面），或提到「冠軍」對戰的隊伍分析、傷害計算、速度線、選角建議、paste 轉換、威脅庫或 meta 更新、pokemon-tools repo 的 M1~M4 開發，都應使用本技能，即使沒有明確要求分析。
---

# Pokémon Champions 對戰分析

使用者「哈哈的爸」的 Champions 對戰助手工作流。所有狀態存在 GitHub repo
**naiyu29/pokemon-tools**（主分支 `main`；開發時另開 `claude/...` 工作分支，完成後 PR merge）；
對話不承載狀態，需要背景先讀 repo 的 `ROADMAP.md` 與 `data/`。

## 基本事實

- 使用者：手機 Android、單打雙打都玩、**在意成本**（AI 只花在建置與更新，對戰中使用零成本）。
- 隊伍「Meta」：仙子伊布／超壞星／熾焰咆哮虎／烈咬陸鯊／妙蛙花／噴火龍(Mega Y)，
  完整配置在 repo `data/my-team.js`（晴天核心：Mega Y 日照＋葉綠素妙蛙花）。
- 遊戲機制：Lv50、Gen 9 機制＋Mega 進化、能力點數 SP 制（每項 0–32）。
- 計算引擎：repo 內 `@smogon/calc`＋`@pkmn/dex`（Mega 種族值用 overrides），
  範例見 `src/analyze.js`。雙打範圍招 ×0.75。
- 賽季資訊與威脅庫：`data/threats.js`（配置為推估，輸出時必須標註）。
- 網頁工具（GitHub Pages，PWA）：<https://naiyu29.github.io/pokemon-tools/>，
  支援 `?foes=id1,id2&mode=doubles&weather=Sun` 預填（見 battle-analysis.md）。

## 工作流選擇

| 使用者給的東西 | 做什麼 | 細節 |
|---|---|---|
| 隊伍能力/狀態頁截圖 | 轉成 Showdown paste＋更新 `data/my-team.js` | `references/screenshot-to-paste.md` |
| 選角畫面截圖（剪影＋屬性圖示） | 辨識對手6隻→回傳工具預填連結→跑計算→選4＋首發建議 | `references/battle-analysis.md` |
| 對戰截圖（賽後覆盤/預研） | 辨識對手→回一條 `?foes=...` 預填連結，點開即完成輸入 | `references/battle-analysis.md` |
| 「分析我的隊伍」「對點」「打得贏嗎」 | 跑 `src/analyze.js` 產對點報告 | `references/battle-analysis.md` |
| 「更新威脅庫」「新賽季」 | 搜尋當季 meta → 重建 `data/threats.js` → 重建網頁＋部署 | `references/season-update.md` |
| 「做 M1/M2/M3/M4」 | 讀 `ROADMAP.md` 照清單推進，完成打勾並 commit | ROADMAP.md |

## 輸出慣例（每個工作流都適用）

- 繁體中文台灣用語；寶可夢、招式、道具用官方繁中譯名，paste 內用英文。
- 傷害標記：**確1**（min≥100%）、**亂1**（max≥100%）、**確2**（min≥50%）、**亂2**（max≥50%）。
- 對手配置一律標「推估」；威脅名單標來源與日期。
- 結論先行：選4名單、首發、2–3 條戰場紀律（死亡對位、特性剋制）放最前面，數字表其次。
- 對戰相關回覆求快求短——使用者可能在選角倒數中。

## 威脅庫更新（賽季更新）SOP

完整流程見 `references/season-update.md`。摘要：

1. WebSearch 當季 meta（注意今天日期；用搜尋結果內文，不硬爬被擋的網站）。
2. 重寫 `data/threats.js`（配置為訓練知識推估，檔頭註明來源與日期）。
3. `node src/analyze.js` 重跑分析＋`node scripts/build.js` 重建網頁
   （威脅庫打包在 bundle 內，不重建吃不到新資料）。
4. commit＋push；merge 進 main 後 GitHub Pages（`/docs`）才會上線，PWA 自動換版。

## 注意事項

- 新對話開始 M 系列開發前，先 `git log --oneline -3` 和讀 `ROADMAP.md` 確認進度，
  不要重做已完成的項目。
- 使用者偏好：需要決策時用 Q1/Q2＋A/B/C 選項；多步驟任務結尾加【重點摘要】；
  一次只推進一個小任務。
- 計算數字必須來自引擎實跑，不要憑印象報傷害%；速度值用引擎 rawStats 取得。
