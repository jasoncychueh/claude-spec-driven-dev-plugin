# 功能 Spec 撰寫指南

每個功能在實作前，必須完成三個 spec 文件：需求、設計、任務。

## 三個文件

| 順序 | 文件 | 用途 | 模板 |
|------|------|------|------|
| 1 | `requirements.md` | 定義做什麼（What） | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md` |
| 2 | `design.md` | 定義怎麼做（How） | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md` |
| 3 | `tasks.md` | 分解成可執行任務 | `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md` |

---

## 文件職責區分

**嚴格區分 requirements.md 與 design.md 的內容範疇**，避免職責混淆。

### requirements.md - 業務需求層（What）

專注於**用戶視角**的功能描述，回答「系統要做什麼」：

| 應該包含 | 不應該包含 |
|----------|------------|
| User Story（角色、功能、價值） | 技術架構選擇 |
| Acceptance Criteria（可驗證的行為） | 具體的元件/類別設計 |
| 業務規則與邏輯 | 資料庫 schema / 資料模型 |
| 非功能性需求（效能指標、安全政策） | 演算法實作細節 |
| 功能範圍（In Scope / Out of Scope） | 程式碼結構、檔案路徑 |

### design.md - 技術設計層（How）

專注於**技術視角**的實作方案，回答「系統如何實現」：

| 應該包含 | 不應該包含 |
|----------|------------|
| 系統架構與元件關係 | 重複描述 User Story |
| 元件設計（Purpose、Interfaces、Dependencies） | 業務規則的重新定義 |
| 資料模型與 Schema | 商業目標與價值 |
| API 規格與函數簽名 | 可量化的業務指標 |
| 錯誤處理策略 | |
| 演算法與處理流程 | |
| 測試策略 | |

### 判斷原則

```
❓ 這個內容是否涉及技術選型、程式碼結構、或實作細節？
   ├─ 是 → 寫在 design.md
   └─ 否 →
      ❓ 這個內容是否描述用戶行為、業務規則、或功能期望？
         ├─ 是 → 寫在 requirements.md
         └─ 否 → 可能不需要寫
```

## 撰寫工作流程

### 兩條路徑

本 skill 支援兩條開發路徑（詳見 `mode-selection.md`），下面分別呈現流程概覽。

---

### Quick Fix Mode 流程

```
[使用者請求小改動：bug fix / refactor / 小擴展]
    │
    ├── 主 agent 宣告走 Quick Fix Mode（給 user 調整機會）
    │
    ├── EnterPlanMode
    │     │
    │     ├── 確認 plan file 實際路徑（通常由 Claude Code 自動建立；
    │     │   環境未提供時自建 .spec/quickfix/<slug>.md）
    │     ├── 主 agent 用 Edit tool 寫 plan draft（context / 計畫 / 風險 / 驗證）
    │     │
    │     └── design-reviewer 多輪 review loop（強制）
    │           ├── 主 agent 告訴 reviewer plan file path
    │           ├── reviewer 用 Read 讀 plan file，產 issue list
    │           ├── Architecture Decision → AskUserQuestion 遞給 user
    │           ├── Bugs/Smells → 主 agent 用 Edit 修 plan file
    │           ├── Steering Candidate（若專案有 steering）→ 累積批次處理
    │           └── 直到當輪 0 issues 才退出
    │
    ├── Plan Briefing（對話輸出 plan summary + 重要概念 → 邀請討論）
    │
    ├── ExitPlanMode（提交已 reviewed 版本給 user approve）
    │
    ├── 主 agent 動手實作（按 plan file 內容）
    │     ↳ 注意：Quick Fix Mode 允許主 agent 直接寫 code（與 Spec Mode 不同）
    │
    └── implementation-reviewer 多輪 review loop（強制）
          ├── reviewer 產 issue list
          ├── Architecture Decision → AskUserQuestion 遞給 user
          ├── Bugs/Smells → 主 agent 自己修 code
          └── 直到當輪 0 issues 才退出
```

---

### Spec Mode 流程

```
[/create-spec]
    │
    ├── 載入 steering
    ├── Plan Mode
    │     ├── spec-researcher (背景研究)
    │     └── (optional) design-reviewer Mode A — 對話夥伴 challenge 設計草稿
    │
    ├── 撰寫 requirements.md
    ├── 撰寫 design.md (draft)
    │
    ├── design-reviewer Mode B 多輪 review loop（強制）
    │     ├── reviewer 產 issue list（Bugs / Smells / Decisions / Steering Candidates）
    │     ├── Architecture Decision → 主 agent 用 AskUserQuestion 遞給使用者拍板
    │     ├── Bugs/Smells → 主 agent 修 design.md（Medium/Low defer-and-batch）
    │     ├── Steering Candidate → 累積，批次遞 user（Steering 演進機制）
    │     └── 直到當輪 0 issues 才退出（第 5 輪仍有新 Critical/High → 保險絲）
    │
    ├── 撰寫 tasks.md
    ├── spec-verifier (Stage 1: 完整性)
    ├── tasks-design-verifier (Stage 2: 對齊)
    └── Spec Briefing（對話輸出 spec 重點摘要 + 拍板 Decisions / Waivers → 邀請討論）


[/implement]
    │
    ├── (若本 session 尚未 briefing → condensed briefing 重建 context)
    ├── Stage 1: spec-implementer (Mode 1) 並行 / 順序寫初版 + 自驗 + 建置
    │
    ├── Stage 2: implementation-reviewer 多輪 review loop（強制）
    │     ├── reviewer 產 issue list（整合/Bugs/Smells/Fidelity/Tests/Steering/Decisions）
    │     ├── Architecture Decision → 主 agent 用 AskUserQuestion 遞給使用者拍板
    │     ├── Bugs/Smells → 派工給 spec-implementer (Mode 2) 修（Medium/Low defer-and-batch）
    │     ├── Steering Candidate → 累積，批次遞 user（Steering 演進機制）
    │     └── 直到當輪 0 issues 才退出（第 5 輪仍有新 Critical/High → 保險絲）
    │
    └── Stage 3: Summary
```

兩個 mode 的差異只在「文件層次（plan file vs steering+spec docs）」與「動手者（主 agent vs spec-implementer）」 — review loop 機制完全共用（同一份 `review-protocol.md`）。

---

### 1. requirements.md - 需求文件

**MANDATORY**: 用 Read tool 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/requirements-template.md` 完整內容。

定義內容：
- Introduction - 功能概述、解決的問題
- Alignment with Product Vision - 如何支援產品願景
- Requirements - 使用 User Story + Acceptance Criteria
- Non-Functional Requirements - 效能、安全性、可靠性

#### User Story 格式

```
As a [角色], I want [功能], so that [價值]
```

#### Acceptance Criteria 格式

```
WHEN [事件] THEN [系統] SHALL [行為]
IF [前置條件] THEN [系統] SHALL [行為]
WHEN [事件] AND [條件] THEN [系統] SHALL [行為]
```

**撰寫要點**：
- 每個需求都有明確的 User Story
- Acceptance Criteria 必須可驗證
- **禁止**在需求中描述技術實作（架構、元件、資料模型）
- **禁止**指定程式碼結構或檔案路徑
- 參考 `steering/product.md` 確保對齊產品願景
- 專注於「用戶能做什麼」而非「系統如何做」

---

### 2. design.md - 設計文件

**MANDATORY**: 用 Read tool 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/design-template.md` 完整內容。

定義內容：
- Overview - 高階設計概述
- Steering Document Alignment - 遵循 tech.md 和 structure.md
- Code Reuse Analysis - 可復用的現有元件
- Architecture - 架構圖（Mermaid）
- Components and Interfaces - 元件設計、公開 API
- Data Models - 資料結構定義
- Error Handling - 錯誤處理策略
- Testing Strategy - 測試計畫

**撰寫要點**：
- 架構圖清楚表達元件關係
- 每個元件有 Purpose、Interfaces、Dependencies
- 識別可復用的現有程式碼
- 確保符合 `steering/tech.md` 的技術選型
- 確保符合 `steering/structure.md` 的命名規範
- **包含所有實作細節**：API 規格、函數簽名、演算法流程
- **不重複** requirements.md 的 User Story，只需引用需求編號
- 專注於「系統如何實現」而非「用戶能做什麼」

---

### 3. tasks.md - 任務清單

**MANDATORY**: 用 Read tool 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/templates/tasks-template.md` 完整內容。

定義內容：
- 將設計分解為可執行的任務
- 每個任務對應一個可交付的單元
- 按依賴順序排列

#### 任務格式

```markdown
- [ ] {序號}. {任務標題}
  - File: {檔案路徑}
  - {任務描述}
  - Purpose: {這個任務的目的}
  - Design ref: {design.md 中對應的章節/元件}
  - _Leverage: {可復用的現有程式碼}_
  - _Requirements: {對應的需求編號}_
```

**撰寫要點**：
- 每個任務只做一件事（Single Responsibility）
- 任務大小適中（0.5-2 天可完成）
- 被依賴的任務放前面
- 每個任務完成後可獨立測試
- Design ref 明確指向 design.md 的對應章節，實作細節由 agent 直接從 design.md 讀取

---

## 核心原則：Design as Single Source of Truth

design.md 是實作的唯一真理來源。tasks.md 負責定義「做什麼」和「做的順序」，具體「怎麼做」由 agent 直接從 design.md 的對應章節讀取。

這意味著：
- tasks.md 不需要重複 design.md 的實作細節
- `Design ref` 欄位建立任務與設計的明確對應關係
- 當 design.md 更新時，對應任務的實作方式自動跟隨更新

---

## 輸出位置

完成的文件放置於：

```
.spec/specs/{feature-name}/
├── requirements.md
├── design.md
├── tasks.md
└── review-log.md
```
