# M4.2 端上辨識 POC 結論（2026-09-07）

測試對象：選角畫面截圖（2404×1080，Android 直錄）對手六隻
（Primarina／Tyranitar／Maushold／Volcarona／Gholdengo／Sneasler）。

## 實驗結果

| 方法 | 結果 | 結論 |
|---|---|---|
| 固定版位裁切（卡片比例定位） | ✅ 六格全部裁中 | 可行，座標比例見 poc_match.py |
| HOME 渲染圖 + 遮罩模板比對（CCORR/SQDIFF、多尺度） | ❌ 0/6 | 遊戲用待機動畫截幀，**姿勢與 HOME 官方渲染不同**，像素比對注定失敗 |
| 顏色直方圖（H-S、姿勢無關） | ⚠ top5 命中 2/6 | 只有弱訊號：白色系寶可夢互相混淆、場景燈光污染色彩 |

## 推薦架構：遊戲原生模板庫（自舉式）

外部圖庫（HOME/pokesprite）姿勢對不上；但**遊戲自己的 UI 姿勢固定**——
同一隻在選角畫面永遠同一幀。因此：

1. 每次分析截圖時，自動把六格裁切存入 `templates/{species}/`。
2. 冷啟動期（模板庫空）由 Claude 視覺辨識（M3 流程），辨識結果同時完成標註。
3. 模板庫累積後，改用樸素模板比對（同圖源、同姿勢 → 高準確率），
   比不出來的才回退 Claude。→ **越用越省，最終趨近零 AI 成本**。
4. 單一使用者＋固定手機解析度，比 PCBL 的 DINOv2 嵌入方案更簡單夠用；
   嵌入模型（onnxruntime-web）留作備案。

## 附帶教訓

- 遮罩 TM_CCORR_NORMED 會被背景色帶跑（配出整排粉紅寶可夢）；遮罩 SQDIFF 偏好暗色模板。
- 肉眼辨識剪影會錯（曾把 Sneasler 認成 Toxicroak）——自動比對值得做。
- 模板來源：PokeAPI sprites（HOME 渲染）、pokesprite（box icon）均與 Champions 選角圖不同源。
- 前代 Poke_Battle_Logger（MIT）的 unknown→labeled 標註流程就是這個自舉思路，可參考其實作。
