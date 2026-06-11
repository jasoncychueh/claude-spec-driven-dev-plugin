# Review Log — {feature}

> 本文件記錄此 feature 的 review/resolve 過程。
>
> **正式文件**（requirements.md / design.md / tasks.md / production code）描述「決定後的世界長什麼樣」。
> **本 log** 描述「為什麼是這個世界、過程中拒絕了什麼、哪些原則被刻意豁免」。
>
> **隔離紀律**：本 log 與正式文件**物理隔離** — 正式文件完全不出現 review-log reference / pointer / letter tag。Decision 結果若需反映到 design.md，把 chosen option 的**內容**用**中性 design rationale**（技術 / codebase 慣例 / 反面後果）整合進 Component 描述，不揭露 reviewer / Decision 編號 / Round 來源。
>
> 寫入規範見 spec-driven-development plugin 的 `references/review-log-guide.md`（bad/good 對照：`references/review-log-bad-examples.md`）。

---

## 1. Audit Trail（跨輪 issue 一覽）

每輪 reviewer 找到的 issue + final status + resolution 一行描述。

| Round | ID  | Severity | Status | Resolution |
|-------|-----|----------|--------|------------|
| _(無)_ |     |          |        |            |

**Round 命名**：`D{N}` = design review round N；`I{N}` = implementation review round N
**Status 值**：`pending` / `fixed` / `waived` / `decision-resolved` / `false-positive`

---

## 2. Architecture Decisions

每個被升級給 user 拍板的選擇。Reviewer 不替 user 拍板，user 透過 `AskUserQuestion` 回答後由主 agent 寫入此節。

_(無)_

---

## 3. Waivers（刻意豁免）

結構化記錄「違反什麼原則、為什麼接受、trade-off」。當 issue 處理結果是「保留不修」時寫入此節。

_(無)_

---

## 4. False Positives

Reviewer 提出但討論後判定誤判 — 紀錄於此避免未來 reviewer 重複提出。

_(無)_

---

## 5. Steering Updates（昇華紀錄）

開發過程發現、經 user 確認寫入 steering 的專案級原則。來源寫 SC 編號（`D2 SC-1`）、Decision 編號（`Decision D`）、或 `implementer report`。

| #      | 日期 | 原則 | 寫入位置 | 來源 |
|--------|------|------|----------|------|
| _(無)_ |      |      |          |      |
