# Spec / Plan Briefing 指引

實作開始前，主 agent 用**對話輸出**向 user 摘要整個 spec / plan 的重點與重要概念。

## 觸發時點

| Mode | 時點 | 形式 |
|---|---|---|
| Spec Mode | `/create-spec` 完成（spec-verifier + tasks-design-verifier 通過後） | 完整 Spec Briefing |
| Spec Mode | `/implement` 啟動時，若本 session 尚未對此 feature briefing 過（典型：隔 session 實作） | Condensed briefing（重點壓縮版） |
| Quick Fix Mode | design-reviewer loop 收斂後、**ExitPlanMode 之前** | Plan Briefing |

## 為什麼需要 briefing

Spec 文件是為「之後反覆查閱」優化的 — 結構化、完整、機械可驗證。它**不是**為「第一次進入狀況」優化的。實務上 user 不一定會逐字讀完 spec；沒有 briefing，誤解會在實作後才浮現，修正成本高一個數量級。

Briefing 的目的：讓 user 在 2-3 分鐘內建立正確的心智模型，**在最便宜的時點（實作前）觸發討論**。Quick Fix Mode 同理 — ExitPlanMode 呈現的是完整 plan file，briefing 是它的人類入口。

## 與 formal-doc 隔離紀律的關係

Briefing 是**對話輸出，不寫入任何文件** — 它不是 formal doc，100% 隔離紀律**不適用**：

- Briefing 可以（且應該）揭露 review 過程的**結論** — 拍板的 Architecture Decisions、接受的 Waivers 及其代價。這正是 user 需要快速掌握的「為什麼是這個世界」，來源就是 review log
- 但**不要**把 briefing 內容回寫進 design.md / tasks.md（那會變成 process narration，違反隔離紀律）
- 引用 Decision / Waiver 時可帶編號（`Decision D` / `W1`），user 想深究時對得到 review-log

## 內容結構（建議順序，依任務規模取捨）

1. **一句話定位** — 這個 feature / fix 做什麼、為什麼現在做
2. **架構重點** — 核心元件與資料流的口語化描述（2-5 點）；引入的新概念第一次出現就給一句定義
3. **關鍵設計決定** — review 過程拍板的 Decisions 結果 + 各一行理由（不是重列 Options，是講結論與影響）
4. **刻意接受的限制** — Waivers + 各自付出的代價（user 該知道「我們放棄了什麼」）
5. **實作展望** — Phase 結構、會動到哪些區域、大致範圍（Quick Fix：改動檔案清單 + 驗證方式）
6. **明確邀請討論** — 結尾固定邀請：「如果哪裡跟你的預期不符，現在提出 — 比實作後改便宜得多」

## 校準（為人類認知極限設計 — 同 decision-escalation-guide 哲學）

| ✅ 做 | ❌ 不做 |
|---|---|
| 全文 user 2-3 分鐘讀完（Spec Mode 約 20-40 行；Quick Fix / condensed 約 10-20 行）| 把 design.md 段落整段重貼 — briefing 是**翻譯**不是節錄 |
| 口語 prose 為主，完整句子 | bullet 碎片堆疊、縮寫鏈、機械式填表 |
| 新概念 / 專案特有術語第一次出現給一句解釋 | 假設 user 記得 design.md 裡的所有命名 |
| 需要細節時指向文件位置（design.md §X / plan file 段落）| 為了完整性把細節全塞進 briefing |
| 講 review 的**結論**（拍板了什麼、豁免了什麼）| 講 review 的**過程**（「我跑了 5 輪、第 3 輪發現…」— 無資訊量的 process narration）|
| 按「user 沒讀過 spec」的假設寫 | 寫成 spec 的目錄索引（「§3 講架構、§4 講資料模型」）|

## User 提出疑慮時的處理

Briefing 的價值在於觸發討論 — user 回應後依性質處理：

- **誤解** → 口頭澄清即可，必要時檢討 briefing 哪裡造成誤導
- **Spec / plan 真的有問題** →
  - Spec Mode：回 `/update-spec` 修正（觸發對應 verifier 重跑）；若還在 `/create-spec` 流程內直接修 + 補一輪 design-reviewer
  - Quick Fix Mode：直接 Edit plan file；改動若涉及設計實質，補一輪 design-reviewer 再 ExitPlanMode
- **新的偏好 / 原則浮現** → 依「Steering 演進機制」評估是否昇華進 steering

## Condensed briefing（/implement 隔 session 啟動時）

完整 briefing 的壓縮版（10-20 行）：一句話定位、架構重點（2-3 點）、已拍板 Decisions / Waivers 各一行、本次 /implement 會執行的 task 範圍。目的是重建 context，不是重新討論 — spec 在上個 session 已收斂，除非 user 主動提出異議。
