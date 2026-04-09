# Steering 文件撰寫指南

Steering 文件是專案級的指引，定義產品願景、技術選型和程式碼組織方式。

## 精煉原則

Steering 文件是專案的「護欄」，應該精煉且只記錄真正重要的內容：

- **抽象概念**：產品願景、設計哲學、核心原則
- **技術規範**：技術堆疊、架構模式、關鍵技術決策及其原因
- **Convention**：命名規範、模組邊界、程式碼組織慣例

避免在 steering 中寫入：
- 具體的功能需求或實作細節（這屬於功能 spec）
- 過度細節的規格（例如完整的 API schema）
- 一次性的決策紀錄（除非是影響全專案的架構決策）

Steering 文件應該是「活的文件」，隨專案演進持續更新。

## 三個文件

| 順序 | 文件 | 用途 | 模板 |
|------|------|------|------|
| 1 | `product.md` | 做什麼、為什麼 | [`../templates/product-template.md`](../templates/product-template.md) |
| 2 | `tech.md` | 用什麼技術 | [`../templates/tech-template.md`](../templates/tech-template.md) |
| 3 | `structure.md` | 怎麼組織程式碼 | [`../templates/structure-template.md`](../templates/structure-template.md) |

## 撰寫工作流程

### 1. product.md - 產品指引

**MANDATORY**: 讀取 [`../templates/product-template.md`](../templates/product-template.md) 完整內容。

定義內容：
- Product Purpose - 產品目的、解決的問題
- Target Users - 目標用戶、需求痛點
- Key Features - 核心功能列表
- Business Objectives - 商業目標
- Success Metrics - 可量化的成功指標
- Product Principles - 產品設計原則

**撰寫要點**：
- 具體明確，避免模糊描述
- 以用戶為中心描述價值
- Success Metrics 必須可量化
- 不涉及技術實作細節

---

### 2. tech.md - 技術指引

**MANDATORY**: 讀取 [`../templates/tech-template.md`](../templates/tech-template.md) 完整內容。

定義內容：
- Project Type - 專案類型
- Core Technologies - 語言、框架、依賴
- Application Architecture - 架構模式
- Data Storage - 資料庫、快取
- External Integrations - 外部 API
- Development Environment - 開發工具
- Deployment - 部署方式

**撰寫要點**：
- 所有技術標註版本
- 用圖示說明架構
- 記錄技術決策原因
- 列出已知限制

---

### 3. structure.md - 結構指引

**MANDATORY**: 讀取 [`../templates/structure-template.md`](../templates/structure-template.md) 完整內容。

定義內容：
- Directory Organization - 目錄結構
- Naming Conventions - 命名規則（檔案、類別、函式）
- Import Patterns - Import 順序
- Code Structure Patterns - 程式碼組織模式
- Module Boundaries - 模組邊界、依賴方向
- Code Size Guidelines - 大小限制建議

**撰寫要點**：
- 用 ASCII 繪製目錄樹
- 命名規則用表格呈現
- 每個規則附帶範例
- 明確定義模組邊界

---

## 輸出位置

完成的文件放置於：

```
.spec/steering/
├── product.md
├── tech.md
└── structure.md
```

## 維護指引

Steering 文件必須隨專案演進持續維護：

- **每次 /create-spec 時**：檢視新功能是否與 steering 一致，若引入新技術或新模式，應先更新 steering
- **每次 /update-spec 時**：若設計變更涉及技術方向調整，應同步更新 steering
- **定期檢視**：當 steering 描述與實際專案狀態出現落差時，主動建議更新
