---
name: spec-driven-development
description: "Spec-driven 開發流程，支援 steering/spec 文件的建立、修改、載入與實作。使用時機：(1) 開發新功能前需要規劃 (2) 建立或修改 steering 文件 (3) 建立或修改功能 spec (4) 載入已有 spec 繼續實作 (5) 驗證 tasks 與 design 的對齊性 (6) 按 spec 執行實作"
---

# Spec-Driven Development

確保所有開發工作都遵循「先規格、後實作」的原則。

## Quick Reference

| 命令 | 說明 |
|------|------|
| `/load-spec <feature>` | 載入 spec，驗證後顯示進度 |
| `/create-steering` | 建立 steering 三文件 |
| `/create-spec <feature>` | 建立功能 spec 三文件 |
| `/update-steering <type>` | 修改 steering（product/tech/structure） |
| `/update-spec <feature>` | 修改功能 spec |
| `/verify-spec <feature>` | 驗證 spec 完整性 + tasks vs design 對齊 |
| `/implement <feature>` | 開始實作 |

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

| Agent | 用途 | 觸發時機 |
|-------|------|---------|
| `spec-researcher` | 搜尋現有方案、library、最佳實踐 | /create-spec 規劃階段 |
| `spec-verifier` | 驗證 spec 文件完整性 | /verify-spec Stage 1, /create-spec |
| `tasks-design-verifier` | 驗證 tasks.md 與 design.md 對齊 | /verify-spec Stage 2, /create-spec, /update-spec |
| `spec-implementer` | 按 spec 實作 + 自驗 + 建置 | /implement Stage 1 |
| `implementation-reviewer` | 審查 + 直接修正 + 建置 | /implement Stage 2 |

---

## Workflow Decision Tree

```
用戶請求開發功能
        │
        ▼
┌───────────────────────┐
│ 1. 檢查 Steering 文件  │
│    .spec/steering/    │
└───────────────────────┘
        │
    存在且完整？
    ┌───┴───┐
    │       │
   否       是
    │       │
    ▼       ▼
執行       ┌───────────────────────┐
/create-   │ 2. 檢查功能 Spec       │
steering   │    .spec/specs/{feat}/│
           └───────────────────────┘
                   │
               存在嗎？
               ┌───┴───┐
               │       │
              否       是
               │       │
               ▼       ▼
           執行       執行
           /create-   /load-spec
           spec       ↓
                      /implement
```

---

## 操作說明

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
7. 與用戶確認後退出 Plan Mode
8. 建立 `.spec/specs/{feature}/` 目錄
9. 依序撰寫（先用 Read tool 讀取模板，再按模板格式撰寫）：
   - `requirements.md` — 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md`
   - `design.md` — 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md`
   - `tasks.md` — 模板：`${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md`
10. 使用 `spec-verifier` agent **執行 Spec 完整性檢查**
11. 使用 `tasks-design-verifier` agent **執行 Tasks vs Design 對齊檢查**

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

#### Stage 1: Implementation

**執行步驟**：

1. 從 tasks.md 取得所有待執行任務（`[ ]` 或 `[~]` 狀態）
2. **分析任務依賴關係，將任務分組**
   - 識別任務之間的依賴關係（例如：Task B 需要 Task A 的輸出）
   - 將無依賴關係的任務分成獨立的組（最多 4 組）
   - 同組內的任務可能有依賴關係（agent 會按順序執行）
   - 不同組之間完全獨立（可並行執行）
3. **並行啟動多個 `spec-implementer` agents**
   - 為每個任務組啟動一個獨立的 agent
   - 使用 Agent tool 在**單一訊息**中同時啟動所有 agents（並行執行）
   - 每個 agent 接收：
     * 功能名稱 (feature)
     * 該組的任務列表（任務編號或描述）
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

#### Stage 2: Verification

**執行步驟**：

1. 啟動 `implementation-reviewer` agent 審查所有實作
2. Agent 職責：
   - 跨 agent 整合檢查（介面銜接、資料流、命名一致性）
   - 各 agent 實作與 design.md 的符合度驗證
   - 發現問題時**直接修正**程式碼
   - 修正後確認建置通過
3. Agent 產出審查摘要

---

#### Stage 3: Summary

**執行步驟**：

1. 彙整 Stage 1 和 Stage 2 的結果
2. 報告完成狀態：
   - 已完成的任務清單
   - reviewer 修正的項目（如有）
   - 建置狀態
3. **讓使用者決定下一步**：
   - review diff
   - commit
   - 繼續下個 phase
   - 其他

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

1. **No Steering, No Development** — 沒有 steering 就不開始開發
2. **No Spec, No Code** — 沒有 spec 就不寫程式碼
3. **Research Before Design** — 設計前先研究現有方案
4. **Design is Truth** — design.md 是實作的唯一真理來源
5. **Steering Stays Current** — steering 隨專案演進持續更新
6. **Self-Verify** — implementation agent 自行驗證，不依賴事後補救
7. **Verify Before Deliver** — 交付前必須通過 reviewer 審查和建置確認

---

## 參考文件

| 文件 | 內容 |
|------|------|
| `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/steering-guide.md` | Steering 文件撰寫指南 |
| `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/spec-workflow.md` | Spec 文件撰寫工作流程 |
| `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/checklists.md` | 所有檢查清單 |
