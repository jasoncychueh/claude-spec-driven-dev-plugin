# 檢查清單

本文件包含所有 spec-driven development 流程中使用的檢查清單。

## 目錄

1. [Steering 完整性檢查](#steering-完整性檢查)
2. [Spec 完整性檢查](#spec-完整性檢查)
3. [Tasks vs Design 對齊檢查](#tasks-vs-design-對齊檢查)
4. [Steering 同步檢查](#steering-同步檢查)
5. [設計變更影響評估](#設計變更影響評估)

---

## Steering 完整性檢查

在開始撰寫功能 spec 前，確認 steering 文件完整。

### product.md

- [ ] 有明確的 Product Purpose（產品目的、解決的問題）
- [ ] 定義了 Target Users（目標用戶、痛點）
- [ ] 列出了 Key Features（核心功能，1-3 項主要功能）
- [ ] 有 Business Objectives（商業目標）
- [ ] 有**可量化的** Success Metrics（成功指標）
- [ ] 定義了 Product Principles（產品設計原則）

### tech.md

- [ ] 定義了 Project Type（專案類型）
- [ ] 所有 Core Technologies 都**標註版本**
- [ ] 有 Application Architecture 說明（含架構圖）
- [ ] 定義了 Data Storage 方案
- [ ] 列出 External Integrations
- [ ] 說明 Development Environment
- [ ] 定義 Deployment 方式
- [ ] 記錄了**技術決策原因**（Technical Decisions & Rationale）

### structure.md

- [ ] 有完整的 Directory Organization（ASCII 目錄樹）
- [ ] Naming Conventions 用**表格呈現**
- [ ] 每個命名規則都有**範例**
- [ ] 定義了 Import Patterns
- [ ] 明確定義了 Module Boundaries（模組邊界、依賴方向）
- [ ] 有 Code Size Guidelines

### 一致性檢查

- [ ] 三個文件內容**沒有矛盾**
- [ ] tech.md 的技術選型支援 product.md 的功能需求
- [ ] structure.md 的組織方式符合 tech.md 的架構模式

---

## Spec 完整性檢查

在開始實作前，確認功能 spec 文件完整。

### requirements.md

**內容完整性**：
- [ ] 有 Introduction（功能概述、解決的問題）
- [ ] 說明 Alignment with Product Vision
- [ ] 所有需求都有 **User Story**（角色、功能、價值）
- [ ] 每個需求都有**可驗證的 Acceptance Criteria**
- [ ] 列出 Non-Functional Requirements（效能、安全性、可靠性）

**職責邊界檢查**（確保不越界到 design.md）：
- [ ] **不包含**技術架構選擇（如「使用 React」「採用 MVC」）
- [ ] **不包含**具體元件/類別設計
- [ ] **不包含**資料庫 schema 或資料模型定義
- [ ] **不包含**演算法實作細節
- [ ] **不包含**程式碼結構或檔案路徑
- [ ] 所有內容都是從**用戶視角**描述

### design.md

**內容完整性**：
- [ ] 有 Overview（高階設計概述）
- [ ] 說明 Steering Document Alignment
- [ ] 有 Code Reuse Analysis（可復用的現有元件）
- [ ] 有 Architecture 架構圖（Mermaid）
- [ ] 每個 Component 都有：
  - [ ] Purpose
  - [ ] Interfaces（公開 API）
  - [ ] Dependencies
- [ ] 定義了 Data Models（資料結構）
- [ ] 定義了 Error Handling 策略
- [ ] 有 Testing Strategy

**實作細節完整性**（確保包含足夠的技術資訊）：
- [ ] 包含 **API 規格**（端點、請求/回應格式）
- [ ] 包含**主要函數簽名**（參數、回傳值）
- [ ] 包含**演算法或處理流程**說明
- [ ] 包含**檔案結構**規劃

**職責邊界檢查**（確保不越界到 requirements.md）：
- [ ] **不重複**描述 User Story（只引用需求編號）
- [ ] **不重複**定義業務規則（只引用 requirements.md）
- [ ] **不包含**商業目標或價值說明
- [ ] 所有內容都是從**技術視角**描述

### tasks.md

**編號格式**：
- [ ] 任務以 **Phase 章節**分組（如 `## Phase 1: Data Layer`）
- [ ] 每個 Phase 內任務從 **1 開始**簡單遞增編號(1 2 3 4 5)，而且**不能**有任何的前綴，例如: T1, P.1
- [ ] Phase 之間用 `---` 分隔

**內容完整性**：

- [ ] design.md 中的**所有元件**都有對應任務
- [ ] 任務順序考慮**依賴關係**（被依賴的排前面）
- [ ] 每個任務都有 **Design ref** 欄位（指向 design.md 對應章節）
- [ ] 包含**測試任務**
- [ ] 每個任務只做一件事（Single Responsibility）

### Design vs Requirements 對齊檢查

**需求覆蓋**：
- [ ] requirements.md 中的**每個 User Story** 都有對應的 design 元件
- [ ] requirements.md 中的**每個 Acceptance Criteria** 都能在 design 中找到實現方式
- [ ] 沒有 design 元件是 requirements.md **未提及**的功能

**非功能需求對應**：
- [ ] requirements.md 中的**效能需求**在 design.md 中有考慮
- [ ] requirements.md 中的**安全需求**在 design.md 中有對應措施
- [ ] requirements.md 中的**可靠性需求**在 design.md 中有對應設計

---

## Tasks vs Design 對齊檢查

在 `/load-spec` 載入 tasks.md 前，驗證其與 design.md 的對齊性。

### 1. 元件覆蓋檢查

- [ ] design.md 中**每個 Component** 都有對應的 tasks
- [ ] 沒有 tasks 提到 design.md **未定義**的元件
- [ ] 所有 Data Models 都有對應的實作任務

### 2. 介面一致性檢查

- [ ] tasks 中的**檔案路徑**符合 design.md 的 Components 定義
- [ ] tasks 中的 **Purpose** 與 design.md 的 Component Purpose 一致
- [ ] tasks 中的 **Design ref** 正確指向 design.md 的對應章節
- [ ] 沒有 tasks 修改 design.md 未提及的檔案

### 3. 依賴順序檢查

- [ ] tasks 的順序符合 design.md 中描述的**依賴關係**
- [ ] 被依賴的元件任務**排在前面**
- [ ] 沒有循環依賴

### 4. 資料模型檢查

- [ ] tasks 中涉及的資料結構與 design.md **Data Models** 一致
- [ ] 欄位名稱、類型都符合設計
- [ ] 沒有遺漏重要的資料模型實作

### 5. 錯誤處理檢查

- [ ] design.md 中的 **Error Scenarios** 都有對應的實作任務
- [ ] 錯誤處理策略在相關任務中被提及

### 6. 測試覆蓋檢查

- [ ] 每個主要元件都有對應的**測試任務**
- [ ] design.md 的 **Testing Strategy** 有被任務覆蓋
- [ ] 包含單元測試、整合測試的任務

---

## Steering 同步檢查

在 /create-spec 和 /update-spec 時，檢查功能是否與 steering 一致。

### /create-spec 時

- [ ] 新功能的技術選型是否符合 tech.md 的技術堆疊
- [ ] 新功能是否引入 tech.md 未記錄的新技術/框架
- [ ] 新功能的程式碼組織是否符合 structure.md 的模組邊界
- [ ] 新功能是否支持 product.md 的產品願景和目標
- [ ] 若有不一致，是否需要先更新 steering 文件

### /update-spec 時

- [ ] 設計變更是否影響 tech.md 的技術決策
- [ ] 設計變更是否改變 structure.md 的模組邊界或命名規範
- [ ] 若有影響，steering 文件是否已同步更新

---

## 設計變更影響評估

當 design.md 修改且已有實作程式碼時，分兩階段處理。

### 階段一：/update-spec 時執行

#### 1. 變更範圍識別

- [ ] 列出 design.md 中**新增**的元件/介面/資料模型
- [ ] 列出 design.md 中**修改**的元件/介面/資料模型
- [ ] 列出 design.md 中**刪除**的元件/介面/資料模型
- [ ] 識別變更的**依賴影響**（哪些其他元件會受影響）

#### 2. 任務狀態更新

- [ ] 將受「修改」影響的已完成任務標記為 `[~]`
- [ ] 將「刪除」相關的任務標記為 `[-]`
- [ ] 為「新增」的元件建立新任務
- [ ] 為「修改」需重做的部分建立或更新任務
- [ ] 確認任務順序仍符合依賴關係

#### 3. 顯示變更摘要

- [ ] 輸出受影響任務數量（`[~]` 和 `[-]` 數量）
- [ ] 列出需修改/刪除的檔案清單（預覽）
- [ ] 建議下一步：執行 `/implement` 進行實作同步

---

### 階段二：/implement 時執行

> 當 tasks.md 中有 `[~]` 或 `[-]` 狀態的任務時，`/implement` 會處理這些任務。

#### 4. 實作同步執行

- [ ] 執行 `[-]` 任務：刪除不再需要的程式碼
- [ ] 執行 `[~]` 任務：按新設計重新實作
- [ ] 執行 `[ ]` 任務：實作新增的功能

#### 5. 驗證與完成

- [ ] 由 `implementation-reviewer` agent 審查實作並直接修正不符合項目
- [ ] 確認建置通過
- [ ] 所有 `[~]` 任務完成後改為 `[x]`
- [ ] 所有 `[-]` 任務的程式碼已清理，任務保留作為記錄
- [ ] tasks.md 進度正確反映當前狀態

---

## 使用方式

### 執行 Steering 完整性檢查

```
觸發條件：/create-spec 執行前
執行者：主 Agent
結果：全部通過才能繼續建立 spec
```

### 執行 Spec 完整性檢查

```
觸發條件：/create-spec 完成時
執行者：主 Agent
結果：未通過項目需補完
```

### 執行 Tasks vs Design 對齊檢查

```
觸發條件：/load-spec 載入 requirements.md 和 design.md 後
執行者：主 Agent
結果：通過才載入 tasks.md，否則顯示不一致項目
```

### 執行設計變更影響評估

```
階段一觸發條件：/update-spec 修改 design.md 且已有實作程式碼
執行者：主 Agent
結果：tasks.md 狀態已更新（[~] / [-] / 新任務）

階段二觸發條件：/implement 且 tasks.md 中有 [~] 或 [-] 任務
執行者：主 Agent + Subagents
結果：程式碼已同步，所有任務狀態正確
```
