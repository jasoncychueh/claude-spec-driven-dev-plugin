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
        │
        ▼
┌────────────────────────────────────┐
│ 判斷 mode（依 mode-selection.md）  │
└────────────────────────────────────┘
        │
   ┌────┴────────┐
   │             │
小改動         大型工作
bug / refactor  新功能 / refactor /
小擴展 / typo   跨多元件 / 引入新概念
   │             │
   ▼             ▼
Quick Fix       Spec Mode
Mode             │
   │             ▼
   │       ┌──────────────────────┐
   │       │ Steering 存在？      │
   │       └──────────────────────┘
   │            │     │
   │           否     是
   │            │     │
   │     /create-    /create-spec  (or /load-spec)
   │     steering    ↓
   │                 /implement
   │
   ▼
Plan Mode + design-reviewer loop → ExitPlanMode → 主 agent 動手 → implementation-reviewer loop
```

---

## 操作說明

### Quick Fix Mode（無 slash 命令，主 agent 自動 routing）

當任務符合 Quick Fix Mode 標準（詳見 `mode-selection.md`）— bug fix / refactor / 小擴展 / typo / config 改動 — 走以下流程，**不需要建 steering / requirements / design / tasks 文件**：

**前置宣告**：主 agent 收到任務後，先明確告訴 user：「我打算走 quick fix mode，原因是 {scope/類型 判斷}。如需 spec 級流程請告知。」

**執行步驟**：

1. **EnterPlanMode** — Claude Code 自動建立 plan file 在 `~/.claude/plans/<random>.md`
2. **撰寫 plan draft** — 主 agent 在 Plan Mode 內用 Edit tool 把 plan 寫進 plan file。Plan 內容應包含：
   - Context（為什麼要改）
   - 改動計畫（會動哪些檔案、什麼動作）
   - 風險評估（可能引入什麼 bug / regression）
   - 驗證方式（怎麼測試）
3. **design-reviewer multi-round loop（強制）**：
   - Loop 開始（Round 1）：
     - Invoke `design-reviewer` agent，**告訴它 plan file 的 path**（reviewer 自己用 Read tool 讀 file）
     - Agent 回 issue list（按 review-protocol.md 格式）
   - 處理 issue list：
     - **Architecture Decisions**：用 AskUserQuestion 把每個 Decision 遞給 user 拍板
     - **Bugs/Smells（Critical/High）**：主 agent 用 Edit 修改 plan file
     - **Medium/Low**：詢問 user 是否要修
   - 進入 Round N+1
   - **直到當輪 0 issues 才結束 loop**
4. **ExitPlanMode** — 提交「已 reviewed 的最終版 plan」給 user approve（user 看到的就是收斂後版本）
5. **動手實作** — 退出 Plan Mode 後，**主 agent 直接動手寫 code**（Quick Fix Mode 不派工 spec-implementer，因為 scope 小、沒正式 spec 可對齊）
6. **implementation-reviewer multi-round loop（強制）**：
   - Loop 開始（Round 1）：
     - Invoke `implementation-reviewer` agent
     - Agent 回 issue list
   - 處理 issue list：
     - **Architecture Decisions**：用 AskUserQuestion 遞給 user 拍板
     - **Bugs/Smells（Critical/High）**：主 agent 直接修 code（Quick Fix Mode scope 小，不必派工）
     - **Medium/Low**：詢問 user 是否要修
   - 進入 Round N+1
   - **直到當輪 0 issues 才結束 loop**
7. **Summary** — 報告：
   - 改動的檔案
   - design-reviewer / implementation-reviewer 多輪 review 歷史
   - 使用者拍板的 Architecture Decisions
   - 建置狀態

**重要約束**：Quick Fix Mode 允許主 agent 直接動手寫 code（與 Spec Mode 不同）。這個放寬只在 Quick Fix Mode 適用，理由：scope 小、沒有正式 spec 文件可讓 spec-implementer 對齊。Spec Mode 仍然嚴格禁止主 agent 直接動手。

**中途升級成 Spec Mode**：若 plan / 實作期間發現「scope 比預期大、需要正式 design 文件」，停下來告訴 user 建議升級成 Spec Mode。已寫的 plan 可作為 design.md 的 starting point。

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
      - **若有 Architecture Decisions**：用 AskUserQuestion 把每個 Decision 遞給使用者拍板
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

**設計變更時的任務更新**（當已有實作程式碼）：

```
修改 design.md
        │
        ▼
┌─────────────────────────────┐
│ 1. 識別影響範圍              │
│    - 列出受影響的元件/檔案    │
│    - 判斷變更類型（新增/修改/刪除）│
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ 2. 更新 tasks.md            │
│    - 將受影響的已完成任務改為 │
│      [~]（需重做）           │
│    - 將刪除的功能任務改為     │
│      [-]（已移除）           │
│    - 新增變更所需的新任務     │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ 3. 顯示變更摘要              │
│    - 受影響任務數量          │
│    - 建議下一步（/implement）│
└─────────────────────────────┘
```

> **注意**：`/update-spec` 只更新文件和任務狀態，不執行實作。
> 實際的程式碼修改在執行 `/implement` 時進行。

**任務狀態標記**：

| 標記 | 意義 |
|------|------|
| `[ ]` | 待執行 |
| `[x]` | 已完成 |
| `[~]` | 需重做（設計變更影響） |
| `[-]` | 已移除（設計變更刪除） |

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

**輸出格式**：

```
📋 Spec 驗證報告: {feature}

## Stage 1: Spec 完整性驗證

### requirements.md
✅ 內容完整性：{pass}/{total} 項通過
✅ 職責邊界檢查：{pass}/{total} 項通過

### design.md
✅ 內容完整性：{pass}/{total} 項通過
✅ 實作細節完整性：{pass}/{total} 項通過
✅ 職責邊界檢查：{pass}/{total} 項通過

### tasks.md
✅ 編號格式：{pass}/{total} 項通過
✅ 內容完整性：{pass}/{total} 項通過

### Design vs Requirements 對齊
✅ 需求覆蓋：{pass}/{total} 項通過
✅ 非功能需求對應：{pass}/{total} 項通過

### Stage 1 結論
[x] Spec 完整性驗證通過，繼續執行 Stage 2
[ ] Spec 完整性驗證失敗，請先修正以下問題

## 不通過項目（如有）

| 檔案 | 檢查項目 | 問題描述 |
|------|---------|---------|
| ... | ... | ... |

---

## Stage 2: Tasks vs Design 對齊檢查

✅ 通過項目：{pass} 項
❌ 不通過項目：{fail} 項

## 不通過項目（如有）

| 檢查項目 | 問題描述 | 建議修正 |
|---------|---------|---------|
| ... | ... | ... |

---

## 最終結論

[x] 驗證通過，可執行 /implement
[ ] 有不一致項目，需先修正 spec 文件
```

---

### /implement \<feature\>

開始實作功能。

**前置條件**：
- Spec 已存在（`.spec/specs/{feature}/` 目錄包含 requirements.md、design.md、tasks.md）

**重要**：實作階段**必須**使用 agents 執行，**禁止**主 Agent 直接實作程式碼。

---

#### Stage 1: Initial Implementation

**執行步驟**：

1. 從 tasks.md 取得所有待執行任務（`[ ]` 或 `[~]` 狀態）
2. **分析任務依賴關係，將任務分組**
   - 識別任務之間的依賴關係（例如：Task B 需要 Task A 的輸出）
   - 將無依賴關係的任務分成獨立的組（最多 4 組）
   - 同組內的任務可能有依賴關係（agent 會按順序執行）
   - 不同組之間完全獨立（可並行執行）
3. **啟動 `spec-implementer` agents (Mode 1)**
   - 為每個任務組啟動一個獨立的 agent，明確指示 **Mode 1 (Initial Implementation)**
   - 若有多個獨立組，使用 Agent tool 在**單一訊息**中同時啟動（並行執行）
   - 每個 agent 接收：
     * 功能名稱 (feature)
     * 該組的任務列表（任務編號或描述）
     * Mode 標記：`Mode 1`
     * 提醒 agent 透過 `Design ref` 欄位讀取 design.md 的對應章節
4. **監控所有 agents 的完成狀態**
   - 任一 agent 回報任務完成後，**即時**更新 tasks.md 對應狀態為 `[x]`
   - 收集所有 agents 的實作產出檔案清單
5. **等待所有組完成**：當所有並行 agents 完成後，進入 Stage 2

**進度報告**：每輪任務完成後報告：
- 當前執行的任務組和進度
- 各 agent 的成功/失敗狀態
- 遇到的問題（如有）

---

#### Stage 2: Review Loop (review only，多輪到 0 issues)

> **這個階段是強制的**。`spec-implementer` 在 Stage 1 已做自我驗證（簽章 / 資料模型 / 錯誤處理 / 建置），但**自我驗證抓不到「production 才會炸的問題」**（async race、weak-ref GC、idempotency、leak、stale doc、test gap）— 那是這個 stage 的職責。

**執行步驟**：

1. **Loop 開始**（從 Round 1）：
   - Invoke `implementation-reviewer` agent 對所有實作做資深軟體工程師視角審查
   - Agent 回 issue list（跨 agent 整合 / Bugs / Smells / Design fidelity gaps / Test completeness gaps / Architecture Decisions，按 Critical/High/Medium/Low 分級）
2. **處理 issue list**：
   - **若有 Architecture Decisions**：用 AskUserQuestion 把每個 Decision 遞給使用者拍板。Decisions 拍板後可能反過來要求改 design.md（觸發 /update-spec 流程），或只是改實作策略 — 由使用者決定
   - **若有 Critical/High Bugs/Smells**：主 agent **派工給 `spec-implementer` agent (Mode 2)** 修正
     - 把 issue list（含位置、嚴重度、建議方向）整包丟給 spec-implementer
     - spec-implementer 按 issue 修，每修一個重新自我驗證，整批完後重建
     - **主 agent 不直接動手寫 code**（既有原則：實作必須由 agent 執行）
   - **若有 Medium/Low**：詢問使用者是否要修，由使用者決定
3. 修完進入 Round N+1，**重新 invoke `implementation-reviewer`**
4. **直到當輪 0 issues 才結束 loop**
5. **避免 review 範圍縮水陷阱**：每輪 reviewer 不能只看上一輪修的部分，要抽查未動檔案 — 這個紀律寫在 `implementation-reviewer` agent prompt 裡，主 agent 不需特別處理

**Stage 1 vs Stage 2 的動手者**：

| 階段 | Agent | 動作 |
|---|---|---|
| Stage 1 | `spec-implementer` (Mode 1) | 寫初版 code |
| Stage 2 | `implementation-reviewer` | review only，產 issue list |
| Stage 2 (loop 內) | `spec-implementer` (Mode 2) | 接 issue list 修 code |

**動手寫 / 修 code 的只有 spec-implementer**，reviewer 只 review。

---

#### Stage 3: Summary

**執行步驟**：

1. 彙整 Stage 1 與 Stage 2 的結果
2. 報告完成狀態：
   - 已完成的任務清單
   - implementation-reviewer 多輪 review 的歷史（每輪找了幾個 issue，如何收斂到 0）
   - spec-implementer (Mode 2) 修正的項目（按 issue 編號）
   - 使用者拍板的 Architecture Decisions（如有）
   - 建置狀態
3. **讓使用者決定下一步**：
   - review diff
   - commit
   - 繼續下個 phase
   - 其他

---

## 多輪 Review 機制

`design-reviewer` 和 `implementation-reviewer` 共用一套 multi-round review loop。**詳細協定** — 嚴重度分級、字母編號規則、Architecture Decision 紀律、輸出格式、收斂判斷、reviewer 共用紀律 — 都記載於：

> `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-protocol.md`

兩個 reviewer agent 啟動時會讀取這份文件。主 agent 驅動 loop 時也應該理解其內容。

### Quick Summary（細節看 review-protocol.md）

- **嚴重度**：Critical / High / Medium / Low — Critical+High 必修，Medium+Low 由 user 決定
- **編號**：跨 round 累加不重設（Round 1 用 A-D，Round 2 從 E 接續）
- **收斂**：reviewer 輸出 `0 issues` 才退 loop；含 Critical/High 不可提前退
- **Architecture Decision**：reviewer 沒共識的設計選擇 → 主 agent 用 AskUserQuestion 遞給 user，**不自己拍板**
- **Review/Fix 分工**：reviewer 不動 code；design 階段主 agent 改 design.md，implementation 階段派工給 `spec-implementer (Mode 2)`

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

### 共用原則（兩個 mode 都適用）

1. **Plan Before Code** — 不論大小任務，先有計畫（Quick Fix Mode 走 plan file，Spec Mode 走 design.md），不直接動手
2. **Research Before Design** — 設計前先研究現有方案（Spec Mode 用 spec-researcher，Quick Fix Mode 主 agent 自己快速研究即可）
3. **Self-Verify** — 動手者自行驗證，不依賴事後補救
4. **Verify Before Deliver** — 交付前必須通過 reviewer 審查 + 建置確認
5. **Review Until Convergence** — design-reviewer 與 implementation-reviewer 多輪到 0 issues 才收斂，不接受「夠好就停」（兩個 mode 都強制）
6. **No Architectural Overreach** — Reviewer 遇到「沒有業界共識的設計選擇」時不拍板，由使用者決定

### Spec Mode 特有原則

7. **No Steering, No Spec Mode Development** — 進入 Spec Mode 前必須有 steering
8. **No Spec, No Code** — Spec Mode 下沒 design.md 就不寫程式碼
9. **Design is Truth** — Spec Mode 中 design.md 是實作的唯一真理來源
10. **Steering Stays Current** — steering 隨專案演進持續更新
11. **Implementation by Agent Only (Spec Mode)** — Spec Mode 禁止主 agent 直接動手，必須派工 `spec-implementer`

### Quick Fix Mode 特有原則

12. **Plan File is Truth** — Quick Fix Mode 中 `~/.claude/plans/<random>.md` 是實作的真理來源
13. **Main Agent May Implement (Quick Fix Mode Only)** — Quick Fix Mode 允許主 agent 直接動手（scope 小、無正式 spec 派工對齊基礎）。但 review loop 仍強制
14. **Escalate When Scope Grows** — 過程中發現 scope 超過 Quick Fix Mode 範圍時，停下來告訴 user 建議升級到 Spec Mode

---

## 參考文件

| 文件 | 內容 |
|------|------|
| `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/mode-selection.md` | Quick Fix Mode vs Spec Mode 判斷標準與升降級規則 |
| `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/steering-guide.md` | Steering 文件撰寫指南（Spec Mode）|
| `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/spec-workflow.md` | Spec 文件撰寫工作流程（Spec Mode）|
| `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/checklists.md` | 所有檢查清單（含 Design Review / Implementation Review）|
| `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-protocol.md` | Reviewer agent 共用協定（嚴重度 / 編號 / Decision 紀律 / 輸出格式 / 收斂規則）|
