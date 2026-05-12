# Review Log — {feature}

> 本文件記錄此 feature 的 review/resolve 過程。
>
> **正式文件**（requirements.md / design.md / tasks.md / production code）描述「決定後的世界長什麼樣」。
> **本 log** 描述「為什麼是這個世界、過程中拒絕了什麼、哪些原則被刻意豁免」。
>
> 寫入規範詳見 `${CLAUDE_PLUGIN_ROOT}/skills/spec-driven-development/references/review-log-guide.md`

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
