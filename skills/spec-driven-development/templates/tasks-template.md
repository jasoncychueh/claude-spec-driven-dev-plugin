# Tasks Document

> ## ⛔ 禁止段落（formal doc 100% 隔離原則）
>
> tasks.md **描述「要做哪些任務」**，不夾雜 review 過程的任何痕跡。以下絕對不可出現於 task 描述中：
>
> - 任何 **豁免區塊**（`> **SRP 例外（已知並接受）**：...` / `<!-- WAIVED -->`）
> - 任何 **reviewer letter tag**（`(per Decision X)` / `(per Smell Y)` / `(per spec-verifier Round 2)`）
> - 任何 **review 過程敘述**（「Round 3 修正」/「reviewer 標記為 High」/「user 在 Round 5 拍板保留」）
> - 任何 **review-log 引用** 或 **footnote pointer**（`→ review-log.md §W1` / `> ⓘ ...`）
>
> 若某 task 違反某原則（如 SRP）但被刻意保留，**理由寫在 `review-log.md §3 Waivers`**；tasks.md 內僅描述 task 本身要做的事，**不交代**「為什麼這個 task 違反 X 原則」。
>
> 若某 task 描述天生需要解釋「為什麼這樣切」，用中性 prose（技術限制 / atomicity 要求等），**不揭露** reviewer 來源。詳見 `references/review-log-bad-examples.md`。

## 任務狀態標記

| 標記 | 意義 | 說明 |
|------|------|------|
| `[ ]` | 待執行 | 尚未開始的任務 |
| `[x]` | 已完成 | 已實作並驗證通過 |
| `[~]` | 需重做 | 設計變更影響，需重新實作 |
| `[-]` | 已移除 | 設計變更刪除，程式碼已清理 |

---

## Phase 1: [階段名稱]

- [ ] 1. [任務標題]
  - File: [檔案路徑]
  - [任務描述]
  - Purpose: [這個任務的目的]
  - Design ref: [design.md 中對應的章節/元件名稱]
  - _Leverage: [可復用的現有程式碼]_
  - _Requirements: [對應的需求編號]_

- [ ] 2. [任務標題]
  - File: [檔案路徑]
  - [任務描述]
  - Purpose: [這個任務的目的]
  - Design ref: [design.md 中對應的章節/元件名稱]

---

## Phase 2: [階段名稱]

- [ ] 1. [任務標題]
  - ...
