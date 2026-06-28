# Spec / Plan Briefing 指引

實作開始前，主 agent 用**對話輸出**向 user 摘要整個 spec / plan 的重點與重要概念。

## 觸發時點

| 流程 | 時點 | 形式 |
|---|---|---|
| /create-spec | Plan Mode 結束、**ExitPlanMode 之前** | Plan Briefing（方向確認，輕量） |
| /create-spec | 兩個 verifier 通過後（spec 定案） | 完整 Spec Briefing |
| /update-spec | Plan Mode 結束、**ExitPlanMode 之前** | Plan Briefing（改動規劃） |
| /update-spec | design-review + verifier 通過後（改動定案） | 完整 Spec Briefing |
| /implement | 啟動時、本 session 尚未對此 feature briefing 過（典型：隔 session 實作） | Condensed briefing |
| Quick Fix Mode | design-reviewer loop 收斂後、**ExitPlanMode 之前** | Plan Briefing |

**通則**：凡是 user 即將面對「一大坨 plan 或 spec 要消化」的時刻都要 briefing。所有 **ExitPlanMode 之前**的 Plan Briefing 由 hook 強制保護（見下方「三層提醒架構」第 3 層）；結尾的 Spec Briefing 靠 verifier 報告提醒（第 2 層）+ SKILL 步驟。

## 為什麼需要 briefing

**核心：briefing 是為了降低「讀完整 plan/spec」的認知負擔,不只是審核 gate。** plan file / spec 文件是為「之後反覆查閱」優化的 — 結構化、完整、機械可驗證,但**不是**為「第一次進入狀況」優化的。實務上 user 不一定會逐字讀完;沒有 briefing,誤解會在實作後才浮現,修正成本高一個數量級。

因此**凡是 user 即將面對一大坨 plan/spec 的時刻（每個 plan-exit、每次 spec 定案）都該有 briefing**,讓 user 在 2-3 分鐘內建立正確心智模型、**在最便宜的時點觸發討論**。ExitPlanMode 呈現的是完整 plan file（文件層）；briefing 是它的**人類入口**（理解層）。

## Briefing 是 blocking checkpoint（必須以「回合最終訊息」交付）

兩個系統性事實決定交付形式：

1. **沒有停點的純文字步驟不會停下 agent** — agent 會把 briefing 跟下一步擠在同一回合，甚至整步跳過
2. **夾在 tool call 前面的「回合中段文字」顯示不可靠** — 實測：briefing 文字 + 同回合緊接 AskUserQuestion，user 只看到選項卡，briefing 整段隱形；這在 **CLI 與 remote-control 都會發生**（中段文字可能不渲染、或被後續工具的 UI 蓋掉）。只有回合的**最終訊息**在所有 client 保證顯示

所以交付規則：**briefing 全文必須是該回合的最終訊息 — 輸出後直接結束回合，後面不接任何 tool call**（不接 AskUserQuestion、不接 ExitPlanMode、不接任何工具）。回合結束本身就是強制停點：agent 必須等 user 回覆才能繼續。

- Briefing 結尾固定一句確認問句：「以上有沒有跟你預期不符的地方？沒問題我就繼續」— **user 的回覆就是確認**，不需要再發 AskUserQuestion 選項卡
- User 回覆無異議後，下一回合才進下一步（ExitPlanMode / 結束 /create-spec / Stage 1）；有疑慮則依下方「User 提出疑慮時的處理」
- 注意 ExitPlanMode 本身雖然也會停（呈現 plan 全文＝文件層），但 briefing 是**理解層**的停點 — **不可用 ExitPlanMode 取代 briefing 回合**；briefing 要在 ExitPlanMode **之前**、以回合最終訊息交付（hook 會擋「沒先 briefing 就 ExitPlanMode」）

### 三層提醒架構（為什麼不只靠 SKILL.md 的步驟清單）

SKILL.md 在任務開頭載入；briefing 的決策點在幾十輪 tool call 之後，屆時步驟指示早已遠離注意焦點（甚至被 context compaction 摘要掉）。所以 briefing 由三層機制共同保障，每層都把提醒放在**轉場時刻的最新 context**：

1. **Reviewer 收斂報告**（review-protocol.md 結論模板）— design-reviewer 報 0 issues 時附帶續步提醒
2. **tasks-design-verifier 通過報告** — Spec Mode 驗證通過時附帶 Spec Briefing 續步提醒
3. **PreToolUse command hook（ExitPlanMode）** — harness 強制執行的 deterministic Node 腳本（`hooks/briefing-checkpoint.js`），保護**每一個 ExitPlanMode**（Quick Fix / create-spec / update-spec / 一般 plan mode 皆然 —— briefing 對任何 plan 都降認知負擔,且 fail-open 不會弄壞 plan mode,所以不限縮)。讀 transcript,**略過 agent 的機械性工具回合**（載入 deferred ExitPlanMode 的 ToolSearch、批准後的 Edit 等帶 tool_use 的 assistant 回合）+ tool_result + 注入訊息後,看「第一個實質訊息是否為使用者回覆」:是 → 放行；agent 純文字（其後無 user 回覆,＝沒 briefing 或沒等回覆就退）→ 擋並回一句簡短提醒。**fail-open**（讀不到 transcript / 解析失敗 / 結構意外一律放行），**不會 deadlock**（briefing 完 + user 回覆後前一則就是 user 訊息 → 放行）。濾除 `isSidechain`（subagent 訊息）與 `isMeta`（注入的 local-command / reminder）。這取代了 1.6.2–1.6.5 的 prompt hook —— 那版由 LLM 判斷、看不到歷史,會自我推翻「永遠放行」而在 briefing 完的 retry 上誤擋。

### 補救

User 反映「沒看到 briefing」時，第一個檢查：是不是把 briefing 夾在了 tool call 前的回合中段（client 不顯示）？補救：把 briefing 以回合最終訊息**重新交付**，並結束回合。

## 與 formal-doc 隔離紀律的關係

Briefing 是**對話輸出，不寫入任何文件** — 它不是 formal doc，100% 隔離紀律**不適用**：

- Briefing 可以（且應該）揭露 review 過程的**結論** — 拍板的 Architecture Decisions、接受的 Waivers 及其代價。這正是 user 需要快速掌握的「為什麼是這個世界」，來源就是 review log
- 但**不要**把 briefing 內容回寫進 design.md / tasks.md（那會變成 process narration，違反隔離紀律）
- 引用 Decision / Waiver 時可帶編號（`Decision D` / `W1`），user 想深究時對得到 review-log

## 敘事方式：從實際 use case 出發（核心要求）

Briefing 與 plan / design 的差別不是長度，是**敘事視角**：

- plan / design 描述「**系統是什麼**」— 結構化、概念性、按元件組織（為反覆查閱優化）
- briefing 描述「**使用者 / 系統會經歷什麼**」— 拿 1-2 條代表性 use case 把整個設計走一遍，元件與設計決定在場景中自然出現

純概念條列（「新增 CacheService，採 TTL invalidation，與 EventDispatcher 解耦」）對沒讀過 spec 的人建立不了畫面；同樣內容用場景講 —「使用者更新個人資料後，下一次查詢會先命中 cache，最多 60 秒內可能看到舊值，之後自動更新；這是拍板過的 trade-off，換來查詢不打爆 DB」— 一聽就懂。

**這跟 review 用的是同一個透鏡**（見 SKILL.md「為人類認知負擔校準」）：review 用「使用情境 + 執行流程 + 資料結構」找出真實情境驅動的**核心設計概念**，briefing 就拿那些核心概念、用同一個透鏡對 user 重點說明。所以 briefing 不是只給抽象結論 — 要把該場景**實際觸及的資料結構與執行流程**一起帶出來。因為人類跨多輪對話會忘、程式久了會忘記專案完整架構；把相關資料結構 / 流程一起重述，才幫得上 user 重建心智模型。

做法：

- 挑 **1-2 條代表性 use case**：一條 happy path + 一條最重要的 failure / edge path
- 沿著場景走流程：元件、新概念、**該情境觸及的資料結構與執行流程**在「它出場的那一刻」才介紹，並用該場景解釋 — 不要只給抽象結論，也不要假設 user 記得前幾輪對話講過的結構與流程
- Decisions / Waivers 用**場景後果**講 — 不是「選了 Option 1」，而是「因為這個決定，使用者在 X 情境會經歷 Y」
- Quick Fix Mode 的敘事形：「這個 bug 在什麼操作下會發生 → 修了之後同個操作會變成怎樣 → 剩下什麼風險」

## 內容結構（建議順序，依任務規模取捨）

1. **一句話定位** — 這個 feature / fix 做什麼、為什麼現在做
2. **Use case 走讀** — 上述 1-2 條場景敘事。**這是 briefing 的主體** — 架構重點、新概念、資料流都在場景中帶出，不另立概念清單
3. **關鍵設計決定** — 場景走讀沒涵蓋到的 Decisions 結果，各一行場景化後果
4. **刻意接受的限制** — Waivers + 各自付出的代價（user 該知道「我們放棄了什麼」）
5. **實作展望** — Phase 結構、會動到哪些區域、大致範圍（Quick Fix：改動檔案清單 + 驗證方式）
6. **明確邀請討論** — 結尾固定邀請：「如果哪裡跟你的預期不符，現在提出 — 比實作後改便宜得多」

## 校準（為人類認知極限設計 — 同 decision-escalation-guide 哲學）

| ✅ 做 | ❌ 不做 |
|---|---|
| 從實際 use case 走流程，概念在場景中出場時才介紹 | 純概念條列 — 元件名 + pattern 名堆疊，user 建立不了畫面 |
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

完整 briefing 的壓縮版（10-20 行）：一句話定位、一條最短的 use case 主線（happy path 走一遍）、已拍板 Decisions / Waivers 各一行、本次 /implement 會執行的 task 範圍。同樣**以回合最終訊息交付** — 輸出後結束回合，user 回覆確認才進 Stage 1。目的是重建 context，不是重新討論 — spec 在上個 session 已收斂，除非 user 主動提出異議。
