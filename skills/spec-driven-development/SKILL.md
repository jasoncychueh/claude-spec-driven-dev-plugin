---
name: spec-driven-development
description: "Disciplined development workflow with multi-round architecture review loops. MUST use this skill for any task that writes or modifies code — bug fixes, refactors, typos, config tweaks, new features, large refactors, anything. Auto-routes to one of two modes: (a) Quick Fix Mode for bug fixes / refactors / small extensions within existing architecture — uses Plan Mode + mandatory multi-round review loops (no spec docs needed); (b) Spec Mode for new features / large refactors / cross-component work — builds full steering + requirements + design + tasks docs before implementation. Both modes enforce design-reviewer and implementation-reviewer multi-round loops until 0 issues — review discipline is non-negotiable regardless of task size. Triggers: fix bug / refactor / add feature / write function / build module / change behavior / modify config / restructure code / design API / improve performance / update logic / create or edit spec / verify spec / load spec / implement feature. Also use this skill when explicitly asked about: steering docs, requirements docs, design docs, tasks docs, /create-spec, /implement, /load-spec, /verify-spec."
---

# Spec-Driven Development

A development workflow with **two routing modes**, both backed by multi-round architecture review:

- **Quick Fix Mode**: bug fix / refactor / small extension — Plan Mode + review loops
- **Spec Mode**: new feature / large refactor / cross-component — full steering + spec docs + implementation

**Mode 選擇詳細指引**：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/mode-selection.md`

**核心紀律**：無論哪個 mode，都強制走 `design-reviewer` + `implementation-reviewer` multi-round loops 直到 0 issues。review 紀律是品質防線，**不因為任務大小而妥協**。

## Quick Reference

### 路徑分流（**最先做**）

主 agent 收到任何寫 / 改 code 的請求時，第一步是判斷該走哪個 mode（詳見 `mode-selection.md`）：

| 訊號 | Mode |
|---|---|
| bug fix / 重構 / 小擴展 / typo / config 改動 | **Quick Fix Mode** |
| 新功能 / 大型 refactor / 跨多元件 / 引入新概念 | **Spec Mode** |
| 不確定 | 主 agent 先判斷並告知 user，user 可調整 |

判斷後**明確告訴 user 走哪條路徑**，例如：「這個工作我打算走 quick fix mode，scope 是單元件 bug fix。如果需要 spec 級流程，告訴我。」

### Spec Mode 命令

| 命令 | 說明 |
|------|------|
| `/load-spec <feature>` | 載入 spec，驗證後顯示進度 |
| `/create-steering` | 建立 steering 三文件 |
| `/create-spec <feature>` | 建立功能 spec 三文件 |
| `/update-steering <type>` | 修改 steering（product/tech/structure） |
| `/update-spec <feature>` | 修改功能 spec |
| `/verify-spec <feature>` | 驗證 spec 完整性 + tasks vs design 對齊 |
| `/implement <feature>` | 開始實作 |

### Quick Fix Mode 沒有 slash 命令

主 agent 直接進 Plan Mode 走完整流程，不需要 slash 命令。流程細節見下方「Quick Fix Mode 流程」章節。

---

## 檔案結構

### Steering 文件（專案級）

```
.spec/steering/
├── product.md     # 產品願景、目標用戶、成功指標
├── tech.md        # 技術堆疊、架構模式、部署方式
└── structure.md   # 目錄結構、命名規範、模組邊界
```

### Spec 文件（功能級）

```
.spec/specs/{feature}/
├── requirements.md  # User Story + Acceptance Criteria
├── design.md        # 架構、元件、資料模型（實作的唯一真理來源）
└── tasks.md         # 可執行任務清單
```

---

### Agents

本 skill 使用 plugin 中定義的 agents 執行各階段任務。

| Agent | 用途 | 觸發時機 | 動作 |
|-------|------|---------|------|
| `spec-researcher` | 搜尋現有方案、library、最佳實踐 | /create-spec 規劃階段 | review only |
| `spec-verifier` | 驗證 spec 文件**完整性與格式**（cookie-cutter check） | /verify-spec Stage 1, /create-spec | review only |
| `tasks-design-verifier` | 驗證 tasks.md 與 design.md **對齊** | /verify-spec Stage 2, /create-spec, /update-spec | review only |
| `design-reviewer` | 資深軟體工程師視角審 **design.md 設計品質**（多輪到 0 issues） | /create-spec design 階段 | review only（產 issue list） |
| `spec-implementer` | 寫 / 修 code + 自驗 + 建置（兩種 mode） | /implement Stage 1 (Mode 1) + 接 reviewer issue list (Mode 2) | **write / fix code** |
| `implementation-reviewer` | 資深軟體工程師視角審 **implementation 品質**（多輪到 0 issues） | /implement Stage 2 | review only（產 issue list） |

---

## Workflow Decision Tree

```
用戶請求寫 / 改 code
        ↓
判斷 mode（依 mode-selection.md）
        ↓
   ┌────┴─────┐
   ▼          ▼
Quick Fix    Spec Mode
Mode           ↓
   │      Steering 存在？
   │       否 → /create-steering
   │       是 → /create-spec  (or /load-spec) → /implement
   ▼
Plan Mode + design-reviewer loop → ExitPlanMode →
主 agent 動手 → implementation-reviewer loop
```

---

## 操作說明

### Quick Fix Mode（無 slash 命令，主 agent 自動 routing）

當任務符合 Quick Fix Mode 標準（詳見 `mode-selection.md`）— bug fix / refactor / 小擴展 / typo / config 改動 — 走以下流程，**不需要建 steering / requirements / design / tasks 文件**：

**前置宣告**：主 agent 收到任務後，先告訴 user：「我打算走 quick fix mode，原因是 {判斷依據}。如需 spec 級流程請告知。」

**執行步驟**：

1. **EnterPlanMode** — Claude Code 自動建立 plan file 在 `~/.claude/plans/<random>.md`
2. **撰寫 plan draft** — 主 agent 用 Edit tool 把 plan 寫進 plan file。**內容請依 `plan-content-guide.md` 規範**（聚焦 substance，不寫 process narration）
3. **design-reviewer multi-round loop（強制）** — 告訴 reviewer plan file path，依 `review-protocol.md` 跑到 0 issues。Architecture Decisions 用 AskUserQuestion 遞給 user 拍板；Bugs/Smells 主 agent 用 Edit 修 plan file
4. **ExitPlanMode** — 提交收斂後 plan 給 user approve
5. **動手實作** — 退出 Plan Mode 後，**主 agent 直接動手寫 code**（Quick Fix Mode 特例 — 不派工 spec-implementer）
6. **implementation-reviewer multi-round loop（強制）** — 依 `review-protocol.md` 跑到 0 issues。Bugs/Smells 主 agent 直接修 code（Quick Fix Mode 特例）
7. **Summary** — 報告改動檔案、review 歷史、user 拍板的 Decisions、建置狀態

**重要約束**：Quick Fix Mode 允許主 agent 直接動手寫 code；Spec Mode 仍然嚴格禁止。

**中途升級**：若發現 scope 超出 Quick Fix Mode（例如要動 5+ 檔案、需正式 design 文件），停下來建議 user 升級成 Spec Mode。已寫的 plan 可作為 design.md 的 starting point。

---

### /load-spec \<feature\>

載入功能 spec 並顯示進度。

**執行步驟**：

1. 載入 steering（product.md, tech.md, structure.md）
2. 載入 requirements.md、design.md 和 tasks.md
3. 解析 tasks.md 統計任務狀態
4. 顯示狀態摘要與建議下一步

> **注意**：載入時不執行驗證。驗證只在 `/create-spec` 或 `/update-spec` 完成時執行。
> 如需獨立驗證，請使用 `/verify-spec`。

**輸出格式**：

```
📋 Spec Context 已載入: {feature}

✅ Steering Documents: product.md ✓ | tech.md ✓ | structure.md ✓
✅ Spec Files: requirements.md ✓ | design.md ✓ | tasks.md ✓

📊 進度: ✅ {n} 已完成 | 🔄 {current} 進行中 | ⏳ {m} 待處理

🎯 建議: 繼續執行任務 #{next}: {description}
```

---

### /create-steering

建立專案 steering 文件。

**前置條件**：無

**流程**：
1. 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/steering-guide.md`
2. **進入 Plan Mode**（使用 EnterPlanMode tool）
3. 規劃 steering 內容，與用戶確認後退出 Plan Mode
4. 建立 `.spec/steering/` 目錄
5. 依序撰寫（先用 Read tool 讀取模板，再按模板格式撰寫）：
   - `product.md` — 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/product-template.md`
   - `tech.md` — 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tech-template.md`
   - `structure.md` — 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/structure-template.md`
6. 執行 Steering 完整性檢查

---

### /create-spec \<feature\>

建立功能 spec 文件。

**前置條件**：Steering 文件必須存在且完整

**執行步驟**：

1. 載入 steering documents
2. 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/spec-workflow.md`
3. **Steering 同步檢查**：檢視新功能是否與 steering 一致
   - 新功能的技術選型是否符合 tech.md
   - 是否引入未記錄的新技術/框架
   - 程式碼組織是否符合 structure.md
   - 若有不一致，**先更新 steering 再繼續**
4. **進入 Plan Mode**（使用 EnterPlanMode tool）
5. **啟動 `spec-researcher` agent**（背景執行）：搜尋現有方案、library、最佳實踐
6. 規劃 spec 內容（requirements, design, tasks），將 researcher 的研究結果納入設計考量
7. **(Optional) `design-reviewer` Mode A — Plan Mode 對話夥伴**：
   - 在草擬 design 思路時，**主動詢問使用者**：「要不要邀 design-reviewer 進來 challenge 一下這個設計？」
   - 若使用者同意，invoke `design-reviewer` agent 並把當前 design 草稿（不一定要寫完）丟給他
   - Agent 會回 **challenge list + Architecture Decisions**
   - 對 Architecture Decision，**用 AskUserQuestion 把選擇遞給使用者拍板**，不要主 agent 自己決定
   - 修改 design 思路後可以再 invoke 一次（這是 optional 的非強制循環）
8. 與用戶確認後退出 Plan Mode
9. 建立 `.spec/specs/{feature}/` 目錄
10. 依序撰寫（先用 Read tool 讀取模板，再按模板格式撰寫）：
    - `requirements.md` — 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md`
    - `design.md` — 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md`
11. **`design-reviewer` Mode B — 多輪強制 review（直到 0 issues）**：
    - **這一步是強制的**，不可跳過
    - Loop 開始（從 Round 1）：
      - Invoke `design-reviewer` agent 對 design.md 做設計品質審查
      - Agent 回 issue list（Bugs / Smells / Decisions，按 Critical/High/Medium/Low 分級）
      - **若有 Architecture Decisions**：用 AskUserQuestion 把每個 Decision 遞給使用者拍板（呈現格式依下方「Architecture Decision 呈現紀律」節 / decision-escalation-guide.md）
      - **若有 Bugs/Smells（Critical/High）**：主 agent 修正 design.md（也可以再 invoke researcher 做補充研究）
      - Medium/Low：詢問使用者是否要修，由使用者決定
      - 進入 Round N+1，重新 invoke `design-reviewer`
    - **直到當輪 0 issues 才結束 loop**
12. **撰寫 `tasks.md`**（在 design.md 已收斂之後才開始）— 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md`
13. 使用 `spec-verifier` agent **執行 Spec 完整性檢查**
14. 使用 `tasks-design-verifier` agent **執行 Tasks vs Design 對齊檢查**

---

### /update-steering \<type\>

修改 steering 文件。

**參數**：`type` = product | tech | structure

**流程**：
1. 載入指定的 steering 文件
2. **進入 Plan Mode**（使用 EnterPlanMode tool）
3. 規劃修改內容，與用戶確認後退出 Plan Mode
4. 執行修改
5. 重新執行 Steering 完整性檢查
6. 檢查與其他 steering 文件的一致性

---

### /update-spec \<feature\>

修改功能 spec 文件。

**執行步驟**：

1. 載入 steering documents
2. 載入功能 spec 文件
3. **進入 Plan Mode**（使用 EnterPlanMode tool）
4. 規劃修改內容，與用戶確認後退出 Plan Mode
5. 執行修改
6. **Steering 同步檢查**：若設計變更涉及技術方向調整，同步更新 steering
7. 重新執行對應檢查：
   - 修改 requirements.md → 使用 `spec-verifier` agent 執行 **Spec 完整性檢查**
   - 修改 design.md 或 tasks.md → 使用 `tasks-design-verifier` agent 進行 **Tasks vs Design 對齊檢查**

**設計變更時的任務更新**（當已有實作程式碼）：識別影響範圍 → 更新 tasks.md 標記（受影響改 `[~]`、刪除改 `[-]`、新增 task）→ 顯示變更摘要。詳細流程見 `references/checklists.md` 的「設計變更影響評估」章節。

> **注意**：`/update-spec` 只更新文件和任務狀態，不執行實作。實際程式碼修改在 `/implement` 時進行。

**任務狀態標記**：`[ ]` 待執行 | `[x]` 已完成 | `[~]` 需重做（設計變更影響）| `[-]` 已移除

---

### /verify-spec \<feature\>

獨立執行 Spec 完整性驗證和 Tasks vs Design 對齊驗證。

**重要**：
- **Stage 1 Spec 完整性驗證**必須使用 `spec-verifier` agent 執行
- **Stage 2 Tasks vs Design 對齊檢查**必須使用 `tasks-design-verifier` agent 執行
- **Stage 1 失敗則不執行 Stage 2**

**執行步驟**：

1. 確認 `.spec/specs/{feature}/` 目錄存在且包含 requirements.md、design.md 和 tasks.md
2. **Stage 1: Spec 完整性驗證**
   - 使用 `spec-verifier` agent 執行完整性檢查
   - 驗證 requirements.md（內容完整性 + 職責邊界檢查）
   - 驗證 design.md（內容完整性 + 實作細節完整性 + 職責邊界檢查）
   - 驗證 tasks.md（編號格式 + 內容完整性）
   - **如果任一項不通過，直接停止並輸出報告**
3. **Stage 2: Tasks vs Design 對齊檢查**（僅 Stage 1 通過後執行）
   - 使用 `tasks-design-verifier` agent 執行對齊檢查
4. 顯示完整驗證報告

**輸出格式**：詳細格式由 `spec-verifier` / `tasks-design-verifier` agent 各自決定（每項通過率 + 不通過項目 table + 結論）。

---

### /implement \<feature\>

開始實作功能。

**前置條件**：
- Spec 已存在（`.spec/specs/{feature}/` 目錄包含 requirements.md、design.md、tasks.md）

**重要**：實作階段**必須**使用 agents 執行，**禁止**主 Agent 直接實作程式碼。

---

#### Stage 1: Initial Implementation

1. 從 tasks.md 取得待執行任務（`[ ]` / `[~]` 狀態）
2. 分析依賴關係，將任務分組（無依賴的組可並行，最多 4 組）
3. 啟動 `spec-implementer` agents (Mode 1) — 多組獨立組在同一 message 內並行 spawn；每個 agent 接收 feature 名、任務清單、`Mode 1` 標記，透過 `Design ref` 欄位讀 design.md
4. Agent 回報完成 → 即時更新 tasks.md 為 `[x]`
5. 全部組完成後進 Stage 2

---

#### Stage 2: Review Loop (review only，多輪到 0 issues)

`spec-implementer` 自我驗證抓不到「production 才會炸的問題」（async race、weak-ref GC、idempotency、leak、test gap）— 這是 Stage 2 職責。

1. 每輪 invoke `implementation-reviewer` 對所有實作做資深軟體工程師視角審查，產 issue list（依 review-protocol.md Quick Summary 解讀）
2. 處理 issue list：
   - **Architecture Decisions** → AskUserQuestion 遞給 user 拍板（呈現格式依「Architecture Decision 呈現紀律」節 / decision-escalation-guide.md；可能觸發 /update-spec）
   - **Critical/High Bugs/Smells** → 派工 `spec-implementer (Mode 2)` 修（主 agent 不直接動手）
   - **Medium/Low** → AskUserQuestion 問 user
3. 修完進 Round N+1，直到當輪 0 issues 才退出

**動手寫 / 修 code 的只有 `spec-implementer`** — reviewer 不動 code，主 agent 不動 code（Spec Mode 規則）。

---

#### Stage 3: Summary

報告：完成的任務、implementation-reviewer 多輪歷史、Mode 2 修正項目、user 拍板的 Decisions、建置狀態。讓 user 決定下一步（diff / commit / 下個 phase / 其他）。

---

## Plan / Design 文件內容指引

寫 plan file（Quick Fix Mode）或 design.md（Spec Mode）時，**聚焦 substance，不寫 process narration**：

| ✅ 寫 | ❌ 不寫 |
|---|---|
| Context（為什麼要改）| Process narration（「我會 invoke X 然後 X 會 ...」）|
| 改動清單（具體 file + 改動）| 對 skill 紀律的重述（「依 review-protocol.md...」）|
| 風險評估 | Mode 對比表（「為什麼不走另一個 mode」）|
| Architecture Decisions（Options + Trade-offs）| 預估幾輪 review（reviewer 決定，不由 plan 預估）|
| 驗證方式 | Definition of Done（skill 自動執行的退出條件）|

**為什麼**：reviewer / spec-implementer 都已知道 skill flow，不需要 plan 重述。冗長 process narration = noise，模糊 user 真正需要看的 substance。

詳細指引 + 長度建議 + 範例對比：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/plan-content-guide.md`

---

## Architecture Decision 呈現紀律

主 agent 用 `AskUserQuestion` 把 reviewer 升級的 Decision 遞給 user 時，必須做「reviewer 機械可解析 → user 人類可消化」的翻譯。Reviewer 的四點原料（Option 1 / Option 2 / 為什麼沒共識 / 建議 user 考量）**不能直接照搬**。

| ✅ 做 | ❌ 不做 |
|---|---|
| Question stem 寫 review 過程脈絡（前幾輪做什麼、為什麼此刻浮現、design.md 規範缺口）| 把 Decision 當孤立選項丟出，不交代由來 |
| Function / SQL / config 直接貼 code 片段 + 同 codebase 對照組 | Prose 描述 code（「在 line 142 回傳 bool」）|
| Option `description` 至少覆蓋核心 3 維度（架構 / 一致性 / 功能風險），其他維度按 Decision 性質挑 | 只寫「會 break X」單維度後果；硬湊「N/A」填空 |
| 用 `preview` 欄位放 before/after diff 或完整 function | Code 細節用文字描述但不顯示 |
| 獨立 Decision 拆多次 call；平行相關用同 call 多 questions；條件耦合用複合選項或序列 | 條件耦合（B 依賴 A）硬塞同 call 多 questions（工具不支援這種依賴）|

**為什麼**：人類無法即時撐起 reviewer 那種龐大心智圖。每次互動的 context 量要剛剛好 — 不夠則 user 無法判斷，過量則無法消化。Reviewer 的原料是 raw material，需要主 agent 翻譯成人類友善的對話。

詳細指引 + 完整 has_related 範例：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/decision-escalation-guide.md`

---

## 多輪 Review 機制

`design-reviewer` 和 `implementation-reviewer` 共用一套 multi-round review loop。**詳細協定**（嚴重度分級、字母編號規則、Architecture Decision 紀律、輸出格式、收斂判斷、reviewer 共用紀律）記載於 `references/review-protocol.md`。

**Lazy loading 設計**：reviewer agent 啟動時會自己讀 review-protocol.md。主 agent 不必預讀 — 只需理解下面 Quick Summary 即可驅動 loop。

### Quick Summary

- **嚴重度**：Critical / High / Medium / Low — Critical+High 必修，Medium+Low 由 user 決定
- **編號**：跨 round 累加不重設（Round 1 用 A-D，Round 2 從 E 接續）
- **收斂**：reviewer 輸出 `0 issues` 才退 loop；含 Critical/High 不可提前退
- **Architecture Decision**：reviewer 沒共識的設計選擇 → 主 agent 用 AskUserQuestion 遞給 user，**不自己拍板**
- **Review/Fix 分工**：reviewer 不動 code；design 階段主 agent 改 design.md / plan file，implementation 階段 Spec Mode 派工 `spec-implementer (Mode 2)`、Quick Fix Mode 主 agent 直接修

---

## 錯誤處理

| 情境 | 處理 |
|------|------|
| Steering 不存在 | 阻止 /create-spec，引導 /create-steering |
| Spec 不存在 | 阻止 /load-spec，引導 /create-spec |
| Tasks vs Design 驗證失敗 | 顯示不一致項目，詢問修正方式 |
| 實作時發現設計缺陷 | 暫停，建議更新 design.md |
| 新功能與 Steering 不一致 | 提示先更新 steering 再繼續 |
| 設計變更影響已完成任務 | 執行實作同步流程，標記受影響任務為 `[~]` |
| 設計變更刪除功能 | 標記任務為 `[-]`，reviewer 負責移除程式碼 |
| Agent 通訊失敗 | 重試一次，若仍失敗則升級報告 |
| Circular dependency 偵測 | 停止執行並報告問題 |
| design.md 缺失或不完整 | 請求澄清後再繼續 |

---

## 核心原則

**共用**：
1. **Plan Before Code** — 先有計畫（Quick Fix: plan file / Spec: design.md），不直接動手
2. **Research Before Design** — 設計前先研究現有方案
3. **Self-Verify + Verify Before Deliver** — 動手者自驗，交付前必過 reviewer 審查 + 建置
4. **Review Until Convergence** — multi-round 到 0 issues，不接受「夠好就停」
5. **No Architectural Overreach** — reviewer 遇到沒共識的設計選擇不拍板，遞給 user

**Spec Mode 特有**：
6. **No Steering, No Spec Mode** — 進 Spec Mode 前必須有 steering，並隨專案演進持續更新
7. **Design is Truth** — design.md 是唯一真理來源
8. **Implementation by Agent Only** — 主 agent 禁止直接動手，必派工 `spec-implementer`

**Quick Fix Mode 特有**：
9. **Plan File is Truth** — `~/.claude/plans/<random>.md` 是真理來源
10. **Main Agent May Implement** — 允許主 agent 直接動手（特例，但 review loop 仍強制）
11. **Escalate When Scope Grows** — 發現 scope 超範圍時停下來建議升級 Spec Mode

---

## 參考文件

| 文件 | 內容 |
|------|------|
| `references/mode-selection.md` | Quick Fix Mode vs Spec Mode 判斷標準與升降級規則 |
| `references/plan-content-guide.md` | Plan / Design 文件內容指引（substance vs process narration）|
| `references/steering-guide.md` | Steering 文件撰寫指南（Spec Mode）|
| `references/spec-workflow.md` | Spec 文件撰寫工作流程（Spec Mode）|
| `references/checklists.md` | 所有檢查清單（含 Design Review / Implementation Review）|
| `references/review-protocol.md` | Reviewer agent 共用協定（reviewer 自讀，主 agent 不必預讀）|

所有路徑前綴：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/`
